import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchFeed } from '../feed/feed.service';
import { downloadAudio } from '../episode/download.service';
import { removeAds, getAudioDuration } from '../trimming/trimming.service';
import { mkdirSync } from 'fs';
import path from 'path';
import { secondsToTime } from '../general/timeHelpers';
import { createOrUpdateEpisode, getEpisode } from '../episode/episode.model';
import { processWithValidation } from '../adDetection';

// In-memory storage for active processing progress only
const activeProcessing = new Map<string, ProcessingProgress>();

interface ProcessingProgress {
  currentPosition: number; // Current audio position being analyzed
  totalDuration: number;   // Total audio duration
  lastAdEnd?: number;      // End position of last detected ad
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
    // Create initial episode record
    await createOrUpdateEpisode(feedHash, episodeGuid, {
      original_url: originalUrl,
      status: 'downloading'
    });
    console.log(`Demo: Downloading episode ${episodeGuid}`);
    
    const originalPath = await downloadAudio(originalUrl, feedHash, episodeGuid);
    
    // Get actual audio duration
    const actualDuration = await getAudioDuration(originalPath);
    
    // Initialize progress tracking
    activeProcessing.set(statusKey, {
      currentPosition: 0,
      totalDuration: actualDuration
    });
    
    // Update status to analyzing
    await createOrUpdateEpisode(feedHash, episodeGuid, {
      status: 'analyzing',
      file_path: originalPath
    });
    console.log(`Demo: Analyzing episode for ads`);
    
    // Detect ads with user's credentials
    const customClient = new GoogleGenerativeAI(apiKey);
    
    const validationResult = await processWithValidation(
      originalPath,
      undefined, undefined,
      customClient,
      model,
      (_currentChunk, _totalChunks, currentPosition) => {
        // Update progress with exact position being analyzed
        const progress = activeProcessing.get(statusKey);
        if (progress) {
          progress.currentPosition = currentPosition;
        }
      }
    )
    
    // Create output directory
    const outputDir = path.join(process.env.STORAGE_DIR || './storage', 'audio', feedHash, 'processed');
    mkdirSync(outputDir, { recursive: true });
    
    // Generate output path
    const processedPath = path.join(outputDir, `${episodeGuid}.mp3`);

    // Remove ads - pass the generator directly!
    // This will consume the generator (triggering analysis) and remove ads in a streaming fashion
    const removedSegments = await removeAds(originalPath, processedPath, validationResult.segments);
    
    // Update final status
    const processingTime = Date.now() - startTime;
    await createOrUpdateEpisode(feedHash, episodeGuid, {
      status: 'processed',
      file_path: processedPath,
      ad_segments: removedSegments
    });
    
    // Clean up progress tracking
    activeProcessing.delete(statusKey);
    
    console.log(`Demo: Processing completed in ${secondsToTime(processingTime / 1000)}`);
    return processedPath;
  } catch (error) {
    // Update database with error
    await createOrUpdateEpisode(feedHash, episodeGuid, {
      status: 'error'
    }).catch(() => {}); // Ignore errors updating error status
    
    // Clean up progress tracking
    activeProcessing.delete(statusKey);
    
    throw error;
  }
}

export async function getDemoStatus(feedHash: string, episodeGuid: string): Promise<any> {
  const key = `${feedHash}:${episodeGuid}`;
  
  // First check database
  const episode = await getEpisode(feedHash, episodeGuid);
  
  if (episode) {
    // Convert database status to demo status format
    const baseStatus = {
      status: episode.status === 'processed' ? 'completed' : episode.status,
      segments: episode.ad_segments || [],
      // We don't store processing time in DB, but that's ok
      processingTime: 0
    };
    
    // If actively processing, add progress info
    const progress = activeProcessing.get(key);
    if (progress && episode.status === 'analyzing') {
      // Calculate progress percentage based on audio position
      const progressPercent = progress.currentPosition / progress.totalDuration;
      
      return {
        ...baseStatus,
        currentPosition: progress.currentPosition,
        totalDuration: progress.totalDuration,
        progressPercent: Math.min(progressPercent * 100, 95) // Cap at 95% during analysis
      };
    }
    
    return baseStatus;
  }
  
  // No database record, must be pending
  return { status: 'pending' };
}