// FFmpeg audio processing for ad removal
import ffmpeg from 'fluent-ffmpeg';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

/**
 * Convert HH:MM:SS to seconds
 * @param {string} timeStr - Time in HH:MM:SS format
 * @returns {number} - Time in seconds
 */
export const timeToSeconds = (timeStr) => {
  const parts = timeStr.split(':').map(p => parseFloat(p));
  
  if (parts.length === 1) {
    // SS format
    return parts[0];
  } else if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else {
    throw new Error(`Invalid time format: ${timeStr}`);
  }
};

/**
 * Convert seconds to HH:MM:SS format
 * @param {number} seconds - Time in seconds
 * @returns {string} - Time in HH:MM:SS format
 */
export const secondsToTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
};

/**
 * Get audio duration
 * @param {string} inputPath - Path to audio file
 * @returns {Promise<number>} - Duration in seconds
 */
export const getAudioDuration = async (inputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });
};

/**
 * Extract a chunk of audio from a larger file
 * @param {string} inputPath - Path to input audio file
 * @param {number} startSeconds - Start time in seconds
 * @param {number} durationSeconds - Duration in seconds
 * @returns {Promise<string>} - Path to extracted chunk
 */
export const extractAudioChunk = async (inputPath, startSeconds, durationSeconds) => {
  const tempDir = path.join(os.tmpdir(), 'rss-sponsorblock');
  mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `chunk_${Date.now()}_${startSeconds}.mp3`);
  
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startSeconds)
      .setDuration(durationSeconds)
      .output(tempPath)
      .audioCodec('copy') // Fast copy without re-encoding
      .on('start', (cmd) => {
        console.log(`Extracting chunk: ${startSeconds}s for ${durationSeconds}s`);
      })
      .on('end', () => {
        console.log(`Chunk extracted: ${tempPath}`);
        resolve(tempPath);
      })
      .on('error', (err) => {
        console.error('Error extracting chunk:', err);
        reject(err);
      })
      .run();
  });
};

/**
 * Build keep segments (inverse of ad segments)
 * @param {Array} adSegments - Ad segments to remove
 * @param {number} totalDuration - Total audio duration
 * @returns {Array} - Segments to keep
 */
const buildKeepSegments = (adSegments, totalDuration) => {
  // Convert ad segments to seconds
  const adsInSeconds = adSegments.map(seg => ({
    start: timeToSeconds(seg.start),
    end: timeToSeconds(seg.end)
  }));

  // Sort by start time
  adsInSeconds.sort((a, b) => a.start - b.start);

  const keepSegments = [];
  let lastEnd = 0;

  for (const ad of adsInSeconds) {
    if (ad.start > lastEnd) {
      keepSegments.push({ start: lastEnd, end: ad.start });
    }
    lastEnd = Math.max(lastEnd, ad.end);
  }

  // Add final segment if needed
  if (lastEnd < totalDuration) {
    keepSegments.push({ start: lastEnd, end: totalDuration });
  }

  return keepSegments;
};

/**
 * Remove ad segments from audio file
 * @param {string} inputPath - Input audio file
 * @param {string} outputPath - Output audio file
 * @param {Array} adSegments - Ad segments to remove
 */
export const removeAds = async (inputPath, outputPath, adSegments) => {
  if (!adSegments || adSegments.length === 0) {
    throw new Error('No ad segments provided');
  }

  const duration = await getAudioDuration(inputPath);
  const keepSegments = buildKeepSegments(adSegments, duration);

  console.log(`Removing ${adSegments.length} ad segments`);
  console.log(`Keeping ${keepSegments.length} segments`);

  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath);

    // Build filter complex for concatenating segments
    const filters = [];
    const inputs = [];

    keepSegments.forEach((seg, i) => {
      filters.push(`[0:a]atrim=${seg.start}:${seg.end},asetpts=PTS-STARTPTS[a${i}]`);
      inputs.push(`[a${i}]`);
    });

    if (keepSegments.length > 0) {
      filters.push(`${inputs.join('')}concat=n=${keepSegments.length}:v=0:a=1[out]`);
      
      command
        .complexFilter(filters.join(';'))
        .map('[out]')
        .audioCodec('libmp3lame')
        .audioBitrate('128k')
        .on('start', (cmd) => {
          console.log('FFmpeg command:', cmd);
        })
        .on('progress', (progress) => {
          console.log(`Processing: ${progress.percent?.toFixed(1)}%`);
        })
        .on('end', () => {
          console.log('Ad removal complete');
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .save(outputPath);
    } else {
      reject(new Error('No segments to keep after ad removal'));
    }
  });
};