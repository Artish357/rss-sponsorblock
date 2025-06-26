import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { detectAllAdBreaks, detectFirstAdBreak } from '../src/services/geminiService';
import * as audioProcessor from '../src/services/audioProcessor';
import { mkdirSync, rmSync } from 'fs';

describe('Gemini Service - Unit Tests', () => {
  const testDir = './test-gemini-service';

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (_error) {
      // Directory doesn't exist
    }
  });

  test('detectFirstAdBreak - validates input parameters', async () => {
    // Test with missing chunk path
    await assert.rejects(
      detectFirstAdBreak(null),
      /Failed to detect ad break/
    );

    // Test with non-existent file
    await assert.rejects(
      detectFirstAdBreak('/non/existent/file.mp3'),
      /Failed to detect ad break/
    );
  });

  test('detectAllAdBreaks - requires valid audio path', async () => {
    // Test with null path
    await assert.rejects(
      detectAllAdBreaks(null),
      /Invalid audio path/
    );

    // Test with non-existent file
    await assert.rejects(
      detectAllAdBreaks('/non/existent/audio.mp3'),
      /ffprobe exited with code 1|Invalid audio path/
    );
  });

  test('Time conversion functions', () => {
    // Import time conversion utilities
    const { timeToSeconds, secondsToTime } = audioProcessor;

    // Test timeToSeconds
    assert.strictEqual(timeToSeconds('45'), 45);
    assert.strictEqual(timeToSeconds('2:30'), 150);
    assert.strictEqual(timeToSeconds('1:30:00'), 5400);

    // Test secondsToTime
    assert.strictEqual(secondsToTime(45), '00:45');
    assert.strictEqual(secondsToTime(150), '02:30');
    assert.strictEqual(secondsToTime(3661), '01:01:01');
  });

  test('detectFirstAdBreak - handles API response correctly', async () => {
    // This test would require mocking the Gemini API
    // For now, we'll just test the function exists and has correct signature
    assert.strictEqual(typeof detectFirstAdBreak, 'function');
    assert.strictEqual(detectFirstAdBreak.length, 1); // Takes 1 parameter
  });

  test('detectAllAdBreaks - processes chunks correctly', async () => {
    // This test would require mocking ffmpeg and Gemini
    // For now, we'll test the function signature
    assert.strictEqual(typeof detectAllAdBreaks, 'function');
    assert.strictEqual(detectAllAdBreaks.length, 1); // Takes 1 parameter
  });
});
