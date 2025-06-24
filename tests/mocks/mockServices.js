// Mock services for testing

import { existsSync } from 'fs';
import path from 'path';

// Mock download service that works with test mode
export const createTestDownloadService = () => ({
  downloadAudio: async (url, feedHash, episodeGuid) => {
    if (process.env.MOCK_DOWNLOAD === 'fail') {
      throw new Error('Download failed: Mock error');
    }
    const filePath = path.join(
      process.env.STORAGE_AUDIO_DIR || './storage/audio',
      feedHash,
      'original',
      `${episodeGuid}.mp3`
    );
    return filePath;
  },
  
  getExistingAudioPath: (feedHash, episodeGuid) => {
    const filePath = path.join(
      process.env.STORAGE_AUDIO_DIR || './storage/audio',
      feedHash,
      'original',
      `${episodeGuid}.mp3`
    );
    return existsSync(filePath) ? filePath : null;
  }
});

// Mock Gemini service for testing
export const createTestGeminiService = () => ({
  detectAllAdBreaks: async (audioPath) => {
    if (process.env.MOCK_GEMINI === 'fail') {
      throw new Error('Gemini API error: Mock failure');
    }
    
    if (process.env.MOCK_GEMINI === 'with-ads') {
      return [{
        start: 120,
        end: 180,
        start_formatted: '00:02:00',
        end_formatted: '00:03:00',
        confidence: 0.95,
        description: 'Mock ad break'
      }];
    }
    
    return []; // no-ads
  },
  
  detectFirstAdBreak: async (chunkPath) => {
    if (process.env.MOCK_GEMINI === 'with-ads') {
      return {
        start: "00:02:00",
        end: "00:03:00",
        confidence: 0.95,
        description: 'Mock ad break'
      };
    }
    return null;
  }
});

// Mock audio processor for testing
export const createTestAudioProcessor = () => ({
  removeAds: async (inputPath, outputPath, adSegments) => {
    // Just return the output path for tests
    return outputPath;
  },
  
  getAudioDuration: async (audioPath) => {
    return 300; // 5 minutes
  },
  
  extractAudioChunk: async (audioPath, start, duration, forAnalysis) => {
    return `/tmp/mock-chunk-${start}-${duration}.mp3`;
  },
  
  timeToSeconds: (time) => {
    const parts = time.split(':').reverse();
    return parseInt(parts[0]) + (parts[1] ? parseInt(parts[1]) * 60 : 0) + (parts[2] ? parseInt(parts[2]) * 3600 : 0);
  },
  
  secondsToTime: (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
});