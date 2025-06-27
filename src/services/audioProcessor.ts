// FFmpeg audio processing for ad removal
import ffmpeg from 'fluent-ffmpeg';
import { mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import type { AdSegment } from '../types/index.js';

/**
 * Convert HH:MM:SS to seconds
 */
export const timeToSeconds = (timeStr: string): number => {
  const [s, m, h] = timeStr.split(':').map(t => parseFloat(t)).reverse();
  return (h ?? 0) * 3600 + (m ?? 0) * 60 + s;
};

/**
 * Convert seconds to HH:MM:SS format
 */
export const secondsToTime = (seconds: number): string => {
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
 */
export const getAudioDuration = async (inputPath: string): Promise<number> => new Promise((resolve, reject) => {
  ffmpeg.ffprobe(inputPath, (err, metadata) => {
    if (err) {
      reject(err);
    } else {
      resolve(metadata.format.duration || 0);
    }
  });
});

/**
 * Extract a chunk of audio from a larger file
 */
export const extractAudioChunk = async (
  inputPath: string, 
  startSeconds: number, 
  durationSeconds: number, 
  forAnalysis = true
): Promise<string> => {
  const tempDir = path.join(os.tmpdir(), 'rss-sponsorblock');
  mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `chunk_${Date.now()}_${startSeconds}.mp3`);

  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .setStartTime(startSeconds)
      .setDuration(durationSeconds)
      .output(tempPath);

    if (forAnalysis) {
      // Downsample to 16kbps mono for Gemini analysis
      command
        .audioCodec('libmp3lame')
        .audioBitrate('16k')
        .audioChannels(1)
        .audioFrequency(16000); // 16kHz sample rate
    } else {
      // Fast copy without re-encoding for final processing
      command.audioCodec('copy');
    }

    command
      .on('start', (_cmd) => {
        console.log(`Extracting chunk: ${startSeconds}s for ${durationSeconds}s${forAnalysis ? ' (downsampled)' : ''}`);
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
 * Remove ad segments from audio file
 */
export const removeAds = async (
  inputPath: string, 
  outputPath: string, 
  adSegments: AdSegment[]
): Promise<void> => {
  console.log(`Removing ${adSegments.length} ad segments`);
  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath);
      //aselect='not(between(t,184,314)+between(t,1608,1865))
      const filterSegments = adSegments.map(s => `between(t,${s.start},${s.end})`);
      if (filterSegments.length) {
        const filter = `aselect='not(${filterSegments.join('+')})'`;
        command.complexFilter(filter);
      }
      command
        .on('start', (cmd) => {
          console.log('FFmpeg command:', cmd);
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
    }
  );
};