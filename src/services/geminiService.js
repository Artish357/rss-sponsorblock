// Gemini AI service for ad detection
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { unlink } from 'fs/promises';
import { firstAdBreakPrompt, firstAdBreakSchema } from '../prompts/adDetection.js';
import { extractAudioChunk, getAudioDuration, timeToSeconds, secondsToTime } from './audioProcessor.js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Detect the first ad break in an audio chunk
 * @param {string} chunkPath - Path to audio chunk
 * @returns {Promise<Object|null>} - First ad break found or null
 */
export const detectFirstAdBreak = async (chunkPath) => {
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

    const parsed = JSON.parse(result.response.text());
    return parsed.ad_break; // Will be null if no break found
  } catch (error) {
    console.error('Error detecting first ad break:', error);
    throw new Error(`Failed to detect ad break: ${error.message}`);
  }
};

/**
 * Detect all ad breaks in an audio file using iterative processing
 * @param {string} audioPath - Path to full audio file
 * @returns {Promise<Array>} - Array of all ad breaks found
 */
export const detectAllAdBreaks = async (audioPath) => {
  if (!audioPath) {
    throw new Error('Invalid audio path: path is required');
  }

  const duration = await getAudioDuration(audioPath);
  const adBreaks = [];
  let currentPosition = 0; // seconds

  console.log(`Starting ad break detection for ${duration}s audio`);

  while (currentPosition < duration) {
    // Calculate chunk duration (30 minutes or remaining duration)
    const chunkDuration = Math.min(1800, duration - currentPosition);

    console.log(`Processing chunk at ${currentPosition}s (${chunkDuration}s duration)`);

    // Extract chunk
    const chunkPath = await extractAudioChunk(audioPath, currentPosition, chunkDuration);

    try {
      // Detect first ad break in this chunk
      const adBreak = await detectFirstAdBreak(chunkPath);

      if (adBreak) {
        // Convert relative timestamps to absolute
        const startSeconds = currentPosition + timeToSeconds(adBreak.start);
        const endSeconds = currentPosition + timeToSeconds(adBreak.end);

        const absoluteBreak = {
          start: startSeconds,
          end: endSeconds,
          start_formatted: secondsToTime(startSeconds),
          end_formatted: secondsToTime(endSeconds),
          confidence: adBreak.confidence,
          description: adBreak.description
        };

        adBreaks.push(absoluteBreak);
        console.log(`Found ad break: ${absoluteBreak.start}s - ${absoluteBreak.end}s`);

        // Jump to 60 seconds after this ad break
        currentPosition = absoluteBreak.end + 60;
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
