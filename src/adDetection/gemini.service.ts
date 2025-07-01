// Gemini AI service for ad detection
import { GoogleGenerativeAI, GoogleGenerativeAIError } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { unlink } from 'fs/promises';
import { firstAdBreakPrompt, firstAdBreakSchema } from './prompt';
import { extractAudioChunk, getAudioDuration } from '../trimming/trimming.service';
import { timeToSeconds, secondsToTime } from '../general/timeHelpers';
import dotenv from 'dotenv';
import { AdSegment } from '../general/types';

dotenv.config();

export interface GeminiAdSegment {
  start: string;
  end: string;
  confidence?: number;
}

// Initialize default Gemini AI client
let defaultGenAI: GoogleGenerativeAI | null = null;

// Initialize default client only when needed
function getDefaultClient(): GoogleGenerativeAI {
  if (!defaultGenAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('No Gemini API key set');
    }
    defaultGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return defaultGenAI;
}

/**
 * Detect the first ad break in an audio chunk
 */
export const detectFirstAdBreak = async (
  chunkPath: string, 
  customClient?: GoogleGenerativeAI,
  customModel?: string
): Promise<AdSegment | null> => {
  if (!chunkPath) {
    throw new Error('Failed to detect ad break: chunk path is required');
  }

  const client = customClient || getDefaultClient();
  const modelName = customModel || process.env.GEMINI_MODEL || 'gemini-2.5-pro';
  
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: firstAdBreakSchema
    }
  });

  try {
    const audioData = readFileSync(chunkPath);
    const base64Audio = audioData.toString('base64');

    const result = await model.generateContent([
      { text: firstAdBreakPrompt },
      {
        inlineData: {
          mimeType: 'audio/mpeg',
          data: base64Audio
        }
      },
    ]);

    const parsed: GeminiAdSegment = JSON.parse(result.response.text()).ad_break;
    return parsed ? { start: timeToSeconds(parsed.start), end: timeToSeconds(parsed.end)} : parsed; // Will be null if no break found
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
export async function* detectAllAdBreaks (
  audioPath: string,
  customClient?: GoogleGenerativeAI,
  customModel?: string,
  onProgress?: (currentChunk: number, totalChunks: number, currentPosition: number) => void
): AsyncGenerator<AdSegment> {
  if (!audioPath) {
    throw new Error('Invalid audio path: path is required');
  }

  const duration = await getAudioDuration(audioPath);
  let currentPosition = 0; // seconds
  
  // Calculate total chunks upfront based on initial duration
  const CHUNK_SIZE = parseInt(process.env.AD_CHUNK_DURATION_SECONDS || '1800', 10);
  const totalChunks = Math.ceil(duration / CHUNK_SIZE);
  let currentChunk = 0;

  console.log(`Starting ad break detection for ${secondsToTime(duration)}s audio (${totalChunks} chunks)`);

  while (currentPosition < duration) {
    // Calculate chunk duration (30 minutes or remaining duration)
    const chunkDuration = Math.min(CHUNK_SIZE, duration - currentPosition);
    currentChunk++;
    
    // Ensure we don't exceed total chunks even if processing takes extra iterations
    if (currentChunk > totalChunks) {
      currentChunk = totalChunks;
    }
    
    if (onProgress) {
      onProgress(currentChunk, totalChunks, currentPosition);
    }

    console.log(`Processing chunk ${currentChunk}/${totalChunks} at ${secondsToTime(currentPosition)}s (${chunkDuration}s duration)`);

    // Extract chunk
    const chunkPath = await extractAudioChunk(audioPath, currentPosition, chunkDuration);

    try {
      // Detect first ad break in this chunk
      const adBreak = await detectFirstAdBreak(chunkPath, customClient, customModel);

      if (adBreak) {
        // Convert relative timestamps to absolute
        adBreak.start = currentPosition + adBreak.start;
        adBreak.end = currentPosition + adBreak.end;

        console.log(`Found ad break: ${secondsToTime(adBreak.start)}s - ${secondsToTime(adBreak.end)}s`);
        
        // Jump to 60 seconds after this ad break
        currentPosition = adBreak.end + 60;

        yield adBreak;
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
};
