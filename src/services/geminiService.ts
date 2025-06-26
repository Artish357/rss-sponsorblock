// Gemini AI service for ad detection
import { GoogleGenerativeAI, GoogleGenerativeAIError } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { unlink } from 'fs/promises';
import { firstAdBreakPrompt, firstAdBreakSchema } from '../prompts/adDetection';
import { extractAudioChunk, getAudioDuration, timeToSeconds, secondsToTime } from './audioProcessor';
import dotenv from 'dotenv';
import { AdSegmentInput } from '../types/index.js';

dotenv.config();

// Initialize Gemini AI
if (!process.env.GEMINI_API_KEY) {
  throw new Error('No Gemini API key set');
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Detect the first ad break in an audio chunk
 */
export const detectFirstAdBreak = async (chunkPath: string) => {
  if (!chunkPath) {
    throw new Error('Failed to detect ad break: chunk path is required');
  }

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: firstAdBreakSchema
    }
  });

  try {
    const audioData = readFileSync(chunkPath);
    const base64Audio = audioData.toString('base64');

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: 'audio/mpeg',
          data: base64Audio
        }
      },
      { text: firstAdBreakPrompt }
    ]);

    const parsed: AdSegmentInput = JSON.parse(result.response.text()).ad_break;
    return parsed; // Will be null if no break found
  } catch (error) {
    console.error('Error detecting first ad break:', error);
    if (error instanceof GoogleGenerativeAIError && (error as any).response?.promptFeedback?.blockReason === 'PROHIBITED_CONTENT') {
      return null;
    }
     throw new Error(`Failed to detect ad break: ${error instanceof Object && 'message' in error && error.message}`);
  }
};

/**
 * Detect all ad breaks in an audio file using iterative processing
 */
export const detectAllAdBreaks = async (audioPath: string) => {
  if (!audioPath) {
    throw new Error('Invalid audio path: path is required');
  }

  const duration = await getAudioDuration(audioPath);
  const adBreaks = [];
  let currentPosition = 0; // seconds

  console.log(`Starting ad break detection for ${secondsToTime(duration)}s audio`);

  while (currentPosition < duration) {
    // Calculate chunk duration (30 minutes or remaining duration)
    const chunkDuration = Math.min(1800, duration - currentPosition);

    console.log(`Processing chunk at ${secondsToTime(currentPosition)}s (${chunkDuration}s duration)`);

    // Extract chunk
    const chunkPath = await extractAudioChunk(audioPath, currentPosition, chunkDuration);

    try {
      // Detect first ad break in this chunk
      const adBreak = await detectFirstAdBreak(chunkPath);

      if (adBreak) {
        // Convert relative timestamps to absolute
        adBreak.start = secondsToTime(currentPosition + timeToSeconds(adBreak.start));
        adBreak.end = secondsToTime(currentPosition + timeToSeconds(adBreak.end));

        adBreaks.push(adBreak);
        console.log(`Found ad break: ${adBreak.start}s - ${adBreak.end}s`);

        // Jump to 60 seconds after this ad break
        currentPosition = timeToSeconds(adBreak.end) + 60;
      } else {
        console.log('No ad break found in chunk');
        // No ad break found, move to next chunk
        currentPosition += chunkDuration;
      }
    } finally {
      // Clean up temp chunk file
      await unlink(chunkPath).catch(() => {}); // Ignore errors
    }
  }

  console.log(`Ad detection complete. Found ${adBreaks.length} ad breaks`);
  return adBreaks;
};
