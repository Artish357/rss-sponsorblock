// Audio processing service - orchestrates the full pipeline
import { downloadAudio, getExistingAudioPath } from './download.service';
import { getEpisode, createOrUpdateEpisode } from './episode.model';
import path from 'path';
import { mkdirSync } from 'fs';
import type { Episode, RSSEpisode } from '../general/types';
import { removeAds } from '../trimming/trimming.service';
import { processWithValidation } from '../adDetection/validation.service';
import { CleanDurationSource, parseItunesDuration } from '../adDetection/cleanDuration.service';
import { getEpisodeCleanDurationFromFeed } from '../feed/feed.service';

type ProcessingEpisode = Pick<Episode, 'episode_guid' | 'feed_hash' | 'original_url'>

/**
 * Process a single episode through the full pipeline with validation
 */
export const processEpisode = async (
  feedHash: string, 
  episodeGuid: string, 
  originalUrl: string,
  cleanDuration?: CleanDurationSource
): Promise<Episode> => {
  console.log(`Starting processing for episode: ${episodeGuid}`);

  try {
    // Check if already processed
    const existing = await getEpisode(feedHash, episodeGuid);
    if (existing && existing.status === 'processed' && existing.file_path) {
      console.log('Episode already processed');
      return existing;
    }

    // Update episode with metadata
    await createOrUpdateEpisode(feedHash, episodeGuid, { 
      status: 'downloading'
    });

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

    // Fetch clean duration from feed XML if not provided
    let effectiveCleanDuration = cleanDuration;
    if (!effectiveCleanDuration) {
      const durationFromFeed = await getEpisodeCleanDurationFromFeed(feedHash, episodeGuid);
      if (durationFromFeed) {
        effectiveCleanDuration = {
          type: 'rss',
          value: durationFromFeed
        };
      }
    }

    // Step 2: Detect ad breaks with validation
    console.log('Detecting ad breaks with validation...');
    const validationResult = await processWithValidation(
      audioPath,
      effectiveCleanDuration?.value,
      effectiveCleanDuration
    );

    const adBreaks = validationResult.segments;
    console.log(`Found ${adBreaks.length} ad breaks after validation`);

    // Update status to processing
    await createOrUpdateEpisode(feedHash, episodeGuid, { status: 'processing' });

    // Step 3: Remove ads using FFmpeg (if any detected)
    let outputPath: string;
    
    if (adBreaks.length > 0) {
      console.log('Removing advertisements...');
      const processedDir = path.join(process.env.STORAGE_DIR || './storage', 'audio', feedHash, 'processed');
      mkdirSync(processedDir, { recursive: true });
      outputPath = path.join(processedDir, `${episodeGuid}.mp3`);
      await removeAds(audioPath, outputPath, adBreaks);
    } else {
      console.log('No ads to remove - using original audio');
      outputPath = audioPath;
    }

    // Step 4: Save results
    await createOrUpdateEpisode(feedHash, episodeGuid, {
      original_url: originalUrl,
      file_path: outputPath,
      ad_segments: adBreaks,
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
 * Process multiple episodes in sequence with metadata
 */
export const processBacklog = async (
  episodes: Array<ProcessingEpisode & { metadata?: Partial<RSSEpisode> }>
) => {
  const results = await Promise.all(episodes.map(async episode => {
    try {
      // Convert metadata to CleanDurationSource if duration is available
      let cleanDurationSource: CleanDurationSource | undefined;
      if (episode.metadata?.duration) {
        const parsedDuration = parseItunesDuration(episode.metadata.duration);
        if (parsedDuration) {
          cleanDurationSource = {
            type: 'rss',
            value: parsedDuration
          };
        }
      }
      
      const result = await processEpisode(
        episode.feed_hash,
        episode.episode_guid,
        episode.original_url,
        cleanDurationSource
      );
      return result;
    } catch (error) {
      console.error('Error processing backlog episode', error);
      return null;
    }
  }));

  return results;
};