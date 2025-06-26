import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { detectAllAdBreaks, detectFirstAdBreak } from '../src/services/geminiService';
import * as audioProcessor from '../src/services/audioProcessor';
import { mkdirSync, rmSync } from 'fs';

describe('Gemini Service - Unit Tests', () => {
  const testDir = './temp/test-gemini-service';

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
      detectFirstAdBreak(null as any),
      /Failed to detect ad break: chunk path is required/
    );

    // Test with non-existent file
    await assert.rejects(
      detectFirstAdBreak('/non/existent/file.mp3'),
      /Failed to detect ad break: ENOENT/
    );
  });

  test('detectAllAdBreaks - requires valid audio path', async () => {
    // Test with null path
    await assert.rejects(
      detectAllAdBreaks(null as any),
      /Invalid audio path: path is required/
    );

    // Test with non-existent file
    await assert.rejects(
      detectAllAdBreaks('/non/existent/audio.mp3'),
      /ffprobe exited with code 1|No such file or directory/
    );
  });

  test('Time conversion functions', () => {
    // Test the time conversion functions from audioProcessor
    assert.strictEqual(audioProcessor.timeToSeconds('00:01:00'), 60);
    assert.strictEqual(audioProcessor.timeToSeconds('00:00:30'), 30);
    assert.strictEqual(audioProcessor.timeToSeconds('01:30:45'), 5445);

    assert.strictEqual(audioProcessor.secondsToTime(60), '01:00');
    assert.strictEqual(audioProcessor.secondsToTime(30), '00:30');
    assert.strictEqual(audioProcessor.secondsToTime(5445), '01:30:45');
  });

  test('detectFirstAdBreak - handles API response correctly', async () => {
    // This would require mocking the Gemini API
    // For now, just verify the function exists and has correct signature
    assert.strictEqual(typeof detectFirstAdBreak, 'function');
    assert.strictEqual(detectFirstAdBreak.length, 1);
  });

  test('detectAllAdBreaks - processes chunks correctly', async () => {
    // This would require mocking the audio file and Gemini API
    // For now, just verify the function exists and has correct signature
    assert.strictEqual(typeof detectAllAdBreaks, 'function');
    assert.strictEqual(detectAllAdBreaks.length, 1);
  });
});