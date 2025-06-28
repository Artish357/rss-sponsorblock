import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchFeed } from '../feed/feed.service';
import { downloadAudio } from '../episode/download.service';
import { detectAllAdBreaks } from '../adDetection/gemini.service';
import { removeAds, getAudioDuration } from '../trimming/trimming.service';
import { AdSegment } from '../general/types';
import { mkdirSync } from 'fs';
import path from 'path';

// In-memory status storage
const demoStatus = new Map<string, DemoStatus>();

interface DemoStatus {
  status: 'pending' | 'downloading' | 'analyzing' | 'processing' | 'completed' | 'error';
  segments?: AdSegment[];
  processingTime?: number;
  error?: string;
  progress?: string;
  currentChunk?: number;
  totalChunks?: number;
  actualDuration?: number;
}

export async function fetchDemoFeed(url: string) {
  return await fetchFeed(url);
}

export async function processDemoEpisode(
  feedHash: string, 
  episodeGuid: string,
  originalUrl: string,
  apiKey: string,
  model: string
): Promise<string> {
  const statusKey = `${feedHash}:${episodeGuid}`;
  const startTime = Date.now();
  
  try {
    // Update status: downloading
    demoStatus.set(statusKey, { status: 'downloading' });
    console.log(`Demo: Downloading episode ${episodeGuid}`);
    
    const originalPath = await downloadAudio(originalUrl, feedHash, episodeGuid);
    
    // Get actual audio duration
    const actualDuration = await getAudioDuration(originalPath);
    
    // Update status: analyzing
    demoStatus.set(statusKey, { status: 'analyzing', actualDuration });
    console.log(`Demo: Analyzing episode for ads`);
    
    // Detect ads with user's credentials
    // For now, we'll need to modify the gemini service to accept custom credentials
    // This is a temporary solution - we'll need to refactor detectAllAdBreaks
    const segments = await detectAllAdBreaksWithCustomClient(originalPath, apiKey, model, statusKey);
    
    // Update status: processing (preserve actualDuration)
    const currentStatus = demoStatus.get(statusKey)!;
    demoStatus.set(statusKey, { ...currentStatus, status: 'processing' });
    console.log(`Demo: Processing audio to remove ${segments.length} ad segments`);
    
    // Create output directory
    const outputDir = path.join(process.env.STORAGE_DIR || './storage', 'audio', feedHash, 'processed');
    mkdirSync(outputDir, { recursive: true });
    
    // Generate output path
    const processedPath = path.join(outputDir, `${episodeGuid}.mp3`);
    
    // Remove ads
    if (segments.length > 0) {
      await removeAds(originalPath, processedPath, segments);
    } else {
      // No ads found, just copy the original
      const { copyFile } = await import('fs/promises');
      await copyFile(originalPath, processedPath);
    }
    
    // Update status: completed (preserve actualDuration)
    const processingTime = Date.now() - startTime;
    const finalStatus = demoStatus.get(statusKey)!;
    demoStatus.set(statusKey, {
      ...finalStatus,
      status: 'completed',
      segments,
      processingTime
    });
    
    console.log(`Demo: Processing completed in ${processingTime}ms`);
    return processedPath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    demoStatus.set(statusKey, { 
      status: 'error', 
      error: errorMessage 
    });
    throw error;
  }
}

// Create custom Gemini client and detect ad breaks
async function detectAllAdBreaksWithCustomClient(
  audioPath: string,
  apiKey: string,
  model: string,
  statusKey: string
): Promise<AdSegment[]> {
  // Create a custom Gemini client with user's credentials
  const customClient = new GoogleGenerativeAI(apiKey);
  
  // Use the refactored function with custom client and progress callback
  const segments = await detectAllAdBreaks(audioPath, customClient, model, (currentChunk, totalChunks) => {
    const status = demoStatus.get(statusKey);
    if (status && status.status === 'analyzing') {
      demoStatus.set(statusKey, {
        ...status,
        currentChunk,
        totalChunks
      });
    }
  });
  
  return segments;
}

export async function getDemoStatus(feedHash: string, episodeGuid: string): Promise<DemoStatus> {
  const key = `${feedHash}:${episodeGuid}`;
  return demoStatus.get(key) || { status: 'pending' };
}