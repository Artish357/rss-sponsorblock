// Test helpers and mocks

export const createMockDownloadService = () => {
  return {
    downloadAudio: async (url, feedHash, episodeGuid) => {
      if (process.env.MOCK_DOWNLOAD === 'fail') {
        throw new Error('Download failed: Mock error');
      }
      const path = `./test-storage-processing/${feedHash}/original/${episodeGuid}.mp3`;
      return path;
    },
    getExistingAudioPath: (feedHash, episodeGuid) => {
      const path = `./test-storage-processing/${feedHash}/original/${episodeGuid}.mp3`;
      const { existsSync } = require('fs');
      return existsSync(path) ? path : null;
    }
  };
};

export const createMockGeminiService = () => {
  return {
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
  };
};

export const createMockAudioProcessor = () => {
  return {
    removeAds: async (inputPath, outputPath, adSegments) => {
      if (adSegments.length === 0) {
        throw new Error('No ad segments provided');
      }
      // Mock successful processing
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
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
  };
};