// Audio processing service - orchestrates the full pipeline
import { downloadAudio, getExistingAudioPath } from './audioDownloadService.js';
import { detectAllAdBreaks } from './geminiService.js';
import { removeAds } from './audioProcessor.js';
import { getEpisode, saveEpisode, updateEpisodeStatus } from './storageService.js';
import path from 'path';
import { mkdirSync } from 'fs';

/**
 * Process a single episode through the full pipeline
 * @param {string} feedHash - Feed hash
 * @param {string} episodeGuid - Episode GUID
 * @param {string} originalUrl - Original audio URL
 * @returns {Promise<Object>} - Processed episode info
 */
export const processEpisode = async (feedHash, episodeGuid, originalUrl) => {
  console.log(`Starting processing for episode: ${episodeGuid}`);
  
  try {
    // Check if already processed
    const existing = await getEpisode(feedHash, episodeGuid);
    if (existing && existing.status === 'processed' && existing.file_path) {
      console.log('Episode already processed');
      return existing;
    }

    // Update status to downloading
    await updateEpisodeStatus(feedHash, episodeGuid, 'downloading');

    // Step 1: Download audio if not already downloaded
    let audioPath = getExistingAudioPath(feedHash, episodeGuid);
    if (!audioPath) {
      console.log('Downloading audio...');
      audioPath = await downloadAudio(originalUrl, feedHash, episodeGuid);
    } else {
      console.log('Using existing audio file:', audioPath);
    }

    // Update status to analyzing
    await updateEpisodeStatus(feedHash, episodeGuid, 'analyzing');

    // Step 2: Detect ad breaks using iterative chunking approach
    console.log('Detecting ad breaks...');
    const adBreaks = await detectAllAdBreaks(audioPath);

    console.log(`Found ${adBreaks.length} ad breaks`);

    // If no ads found, just mark as processed with original file
    if (adBreaks.length === 0) {
      await saveEpisode(feedHash, episodeGuid, {
        original_url: originalUrl,
        file_path: audioPath,
        ad_segments: [],
        status: 'processed'
      });
      return await getEpisode(feedHash, episodeGuid);
    }

    // Update status to processing
    await updateEpisodeStatus(feedHash, episodeGuid, 'processing');

    // Step 3: Remove ads using FFmpeg
    console.log('Removing advertisements...');
    const processedDir = path.join(process.env.STORAGE_AUDIO_DIR || './storage/audio', feedHash, 'processed');
    mkdirSync(processedDir, { recursive: true });
    
    const outputPath = path.join(processedDir, `${episodeGuid}.mp3`);
    
    // Convert ad breaks to format expected by removeAds (with HH:MM:SS timestamps)
    const adSegments = adBreaks.map(breakInfo => ({
      start: breakInfo.start_formatted,
      end: breakInfo.end_formatted,
      confidence: breakInfo.confidence,
      description: breakInfo.description
    }));
    
    await removeAds(audioPath, outputPath, adSegments);

    // Step 4: Save results
    await saveEpisode(feedHash, episodeGuid, {
      original_url: originalUrl,
      file_path: outputPath,
      ad_segments: adBreaks,
      status: 'processed'
    });

    console.log(`Processing complete for episode: ${episodeGuid}`);
    return await getEpisode(feedHash, episodeGuid);

  } catch (error) {
    console.error(`Error processing episode ${episodeGuid}:`, error);
    
    // Update status to error
    await updateEpisodeStatus(feedHash, episodeGuid, 'error');
    
    throw error;
  }
};

/**
 * Process multiple episodes in sequence
 * @param {Array} episodes - Array of { feedHash, episodeGuid, originalUrl }
 * @returns {Promise<Array>} - Results for each episode
 */
export const processEpisodesSequentially = async (episodes) => {
  const results = [];
  
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
        episode: episode,
        error: error.message 
      });
    }
  }
  
  return results;
};