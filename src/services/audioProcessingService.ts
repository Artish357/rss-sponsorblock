// Audio processing service - orchestrates the full pipeline
import { downloadAudio, getExistingAudioPath } from './audioDownloadService';
import { detectAllAdBreaks } from './geminiService';
import { removeAds, timeToSeconds } from './audioProcessor';
import { getEpisode, createOrUpdateEpisode } from './storageService';
import path from 'path';
import { mkdirSync } from 'fs';
import type { Episode } from '../types';

interface ProcessingEpisode {
  feedHash: string;
  episodeGuid: string;
  originalUrl: string;
}

interface ProcessingResult {
  success: boolean;
  episode?: Episode | ProcessingEpisode;
  error?: string;
}

/**
 * Process a single episode through the full pipeline
 */
export const processEpisode = async (
  feedHash: string, 
  episodeGuid: string, 
  originalUrl: string
): Promise<Episode> => {
  console.log(`Starting processing for episode: ${episodeGuid}`);

  try {
    // Check if already processed
    const existing = await getEpisode(feedHash, episodeGuid);
    if (existing && existing.status === 'processed' && existing.file_path) {
      console.log('Episode already processed');
      return existing;
    }

    // Update status to downloading
    await createOrUpdateEpisode(feedHash, episodeGuid, { status: 'downloading' });

    // Step 1: Download audio if not already downloaded
    let audioPath = getExistingAudioPath(feedHash, episodeGuid);
    if (!audioPath) {
      console.log('Downloading audio...');
      audioPath = await downloadAudio(originalUrl, feedHash, episodeGuid);
    } else {
      console.log('Using existing audio file:', audioPath);
    }

    // Update status to analyzing
    await createOrUpdateEpisode(feedHash, episodeGuid, { status: 'analyzing' });

    // Step 2: Detect ad breaks using iterative chunking approach
    console.log('Detecting ad breaks...');
    const adBreaks = await detectAllAdBreaks(audioPath);

    console.log(`Found ${adBreaks.length} ad breaks`);

    // If no ads found, just mark as processed with original file
    if (adBreaks.length === 0) {
      await createOrUpdateEpisode(feedHash, episodeGuid, {
        original_url: originalUrl,
        file_path: audioPath,
        ad_segments: [],
        status: 'processed'
      });
      const result = await getEpisode(feedHash, episodeGuid);
      if (!result) {
        throw new Error('Failed to get episode after updating');
      }
      return result;
    }

    // Update status to processing
    await createOrUpdateEpisode(feedHash, episodeGuid, { status: 'processing' });

    // Step 3: Remove ads using FFmpeg
    console.log('Removing advertisements...');
    const processedDir = path.join(process.env.STORAGE_AUDIO_DIR || './storage/audio', feedHash, 'processed');
    mkdirSync(processedDir, { recursive: true });

    const outputPath = path.join(processedDir, `${episodeGuid}.mp3`);

    // Ad breaks are already in the correct format for removeAds
    await removeAds(audioPath, outputPath, adBreaks);

    // Step 4: Save results
    await createOrUpdateEpisode(feedHash, episodeGuid, {
      original_url: originalUrl,
      file_path: outputPath,
      ad_segments: adBreaks.map(({ start, end, ...s}) => ({...s, start: timeToSeconds(start), end: timeToSeconds(end)})),
      status: 'processed'
    });

    console.log(`Processing complete for episode: ${episodeGuid}`);
    const finalResult = await getEpisode(feedHash, episodeGuid);
    if (!finalResult) {
      throw new Error('Failed to get episode after processing');
    }
    return finalResult;

  } catch (error) {
    console.error(`Error processing episode ${episodeGuid}:`, error);

    // Update status to error
    await createOrUpdateEpisode(feedHash, episodeGuid, { status: 'error' });

    throw error;
  }
};

/**
 * Process multiple episodes in sequence
 */
export const processEpisodesSequentially = async (
  episodes: ProcessingEpisode[]
): Promise<ProcessingResult[]> => {
  const results: ProcessingResult[] = [];

  for (const episode of episodes) {
    try {
      const result = await processEpisode(
        episode.feedHash,
        episode.episodeGuid,
        episode.originalUrl
      );
      results.push({ success: true, episode: result });
    } catch (error) {
      results.push({
        success: false,
        episode,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
};