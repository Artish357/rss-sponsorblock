// FFmpeg audio processing for ad removal
import ffmpeg from 'fluent-ffmpeg';
import { mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import type { AdSegment } from '../general/types.js';
import {path as ffmpegPath} from "@ffmpeg-installer/ffmpeg"
import {path as ffprobePath} from "@ffprobe-installer/ffprobe"

ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobePath);

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
  durationSeconds: number | undefined, 
  forAnalysis = true
): Promise<string> => {
  const tempDir = path.join(os.tmpdir(), 'rss-sponsorblock');
  mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `chunk_${Date.now()}_${startSeconds}.mp3`);

  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .setStartTime(startSeconds)
      .output(tempPath);

      if(durationSeconds) {
        command.setDuration(durationSeconds)
      }

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
      .on("start", (cmd) => {
        console.log(cmd)
      })
      .on('end', () => {
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
  adSegments: AdSegment[] | AsyncGenerator<AdSegment>
): Promise<AdSegment[]> => {
  if (Array.isArray(adSegments)) {
    console.log(`Removing ${adSegments.length} ad segments`);
  } else {
    console.log(`Removing ad segments from stream`);
  }
  const audioChunks = Array<string>();
  const adSegmentsResult: AdSegment[] = [];
  let from = 0;
  for await (const adSegment of adSegments) {
    adSegmentsResult.push(adSegment);
    audioChunks.push(await extractAudioChunk(inputPath, from, adSegment.start - from, false));
    from = adSegment.end
  }
  audioChunks.push(await extractAudioChunk(inputPath, from, undefined, false));

  const tempDir = path.join(os.tmpdir(), 'rss-sponsorblock');
  mkdirSync(tempDir, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg(`concat:${audioChunks.join("|")}`)
      .audioCodec('copy')
      .output(outputPath)
      .on("start", (cmd) => {
        console.log(cmd)
      })
      .on('end', () => {
        resolve(adSegmentsResult);
      })
      .on('error', (err) => {
        console.error('Error extracting chunk:', err);
        reject(err);
      })
      .run();
  });
};