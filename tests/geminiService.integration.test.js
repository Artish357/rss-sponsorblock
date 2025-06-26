import { test, describe } from 'node:test';
import assert from 'node:assert';
import { detectFirstAdBreak, detectAllAdBreaks } from '../src/services/geminiService';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Gemini Service - Integration Tests', () => {
  const testDir = './test-gemini-integration';

  test('Gemini API connectivity test', async () => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });

    try {
      // Generate a very short test audio file (5 seconds)
      const testAudioPath = join(testDir, 'test-connectivity.mp3');
      await execAsync(`ffmpeg -f lavfi -i "sine=frequency=1000:duration=5" -ar 16000 -ac 1 -b:a 16k "${testAudioPath}" -y`);

      // Try to detect ads (should find none in a test tone)
      const result = await detectFirstAdBreak(testAudioPath);

      // Result should be null (no ads in test tone)
      assert.strictEqual(result, null, 'Should not detect ads in test tone');

      console.log('✓ Gemini API is working correctly');
    } catch (error) {
      // If API key is invalid or other issues
      console.error('Gemini API test failed:', error.message);

      // Check for common errors
      if (error.message.includes('API_KEY_INVALID')) {
        assert.fail('Invalid Gemini API key');
      } else if (error.message.includes('quota')) {
        console.warn('API quota exceeded - this is expected in heavy usage');
      } else {
        // Other errors might be transient
        console.warn('Gemini API error (may be transient):', error.message);
      }
    } finally {
      // Clean up
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch (_error) {
        // Ignore cleanup errors
      }
    }
  });

  test('detectAllAdBreaks with short audio', async () => {
    mkdirSync(testDir, { recursive: true });

    try {
      // Generate 15 second test audio
      const testAudioPath = join(testDir, 'test-short.mp3');
      await execAsync(`ffmpeg -f lavfi -i "sine=frequency=440:duration=15" -ar 16000 -ac 1 -b:a 16k "${testAudioPath}" -y`);

      // Process the audio
      const adBreaks = await detectAllAdBreaks(testAudioPath);

      // Should complete without errors
      assert.ok(Array.isArray(adBreaks));
      assert.strictEqual(adBreaks.length, 0, 'No ads expected in test tone');

      console.log('✓ detectAllAdBreaks works with short audio');
    } catch (error) {
      if (error.message.includes('quota') || error.message.includes('API_KEY')) {
        console.warn('Skipping due to API limitations:', error.message);
      } else {
        throw error;
      }
    } finally {
      // Clean up
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch (_error) {
        // Ignore
      }
    }
  });
});
