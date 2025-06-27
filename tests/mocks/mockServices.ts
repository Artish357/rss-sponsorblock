// Mock services for testing

import { existsSync } from 'fs';
import path from 'path';
import type { AdSegment } from '../../src/types';

interface TestDownloadService {
  downloadAudio: (url: string, feedHash: string, episodeGuid: string) => Promise<string>;
  getExistingAudioPath: (feedHash: string, episodeGuid: string) => string | null;
}

interface TestGeminiService {
  detectAllAdBreaks: (audioPath: string) => Promise<AdSegment[]>;
  detectFirstAdBreak: (chunkPath: string) => Promise<AdSegment | null>;
}

interface TestAudioProcessor {
  removeAds: (inputPath: string, outputPath: string, adSegments: AdSegment[]) => Promise<string>;
  getAudioDuration: (audioPath: string) => Promise<number>;
  extractAudioChunk: (audioPath: string, start: number, duration: number, forAnalysis?: boolean) => Promise<string>;
  timeToSeconds: (time: string) => number;
  secondsToTime: (seconds: number) => string;
}

// Mock download service that works with test mode
export const createTestDownloadService = (): TestDownloadService => ({
  downloadAudio: async (url: string, feedHash: string, episodeGuid: string): Promise<string> => {
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

  getExistingAudioPath: (feedHash: string, episodeGuid: string): string | null => {
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
export const createTestGeminiService = (): TestGeminiService => ({
  detectAllAdBreaks: async (_audioPath: string): Promise<AdSegment[]> => {
    if (process.env.MOCK_GEMINI === 'fail') {
      throw new Error('Gemini API error: Mock failure');
    }

    if (process.env.MOCK_GEMINI === 'with-ads') {
      return [{
        start: 120,
        end: 180
      }];
    }

    return []; // no-ads
  },

  detectFirstAdBreak: async (_chunkPath: string): Promise<AdSegment | null> => {
    if (process.env.MOCK_GEMINI === 'with-ads') {
      return {
        start: 120,
        end: 180
      };
    }
    return null;
  }
});

// Mock audio processor for testing
export const createTestAudioProcessor = (): TestAudioProcessor => ({
  removeAds: async (_inputPath: string, outputPath: string, adSegments: AdSegment[]): Promise<string> => {
    if (adSegments.length === 0) {
      throw new Error('No ad segments provided');
    }
    // Mock successful processing
    return outputPath;
  },

  getAudioDuration: async (_audioPath: string): Promise<number> =>
    300 // 5 minutes
  ,

  extractAudioChunk: async (_audioPath: string, start: number, duration: number, _forAnalysis?: boolean): Promise<string> => `/tmp/mock-chunk-${start}-${duration}.mp3`,

  timeToSeconds: (time: string): number => {
    const parts = time.split(':').reverse();
    return parseInt(parts[0]) + (parts[1] ? parseInt(parts[1]) * 60 : 0) + (parts[2] ? parseInt(parts[2]) * 3600 : 0);
  },

  secondsToTime: (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
});

// Aliases for backward compatibility
export const createMockDownloadService = createTestDownloadService;
export const createMockGeminiService = createTestGeminiService;
export const createMockAudioProcessor = createTestAudioProcessor;