import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { extractAudioChunk, removeAds, getAudioDuration, timeToSeconds, secondsToTime } from '../src/services/audioProcessor';
import { mkdirSync, rmSync, existsSync, promises as fsPromises } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Audio Processor - Downsampling Feature', () => {
  const testDir = './temp/test-audio-processor';
  const testAudioPath = join(testDir, 'test.mp3');

  beforeEach(async () => {
    // Create test directory
    mkdirSync(testDir, { recursive: true });

    // Create a test audio file using FFmpeg
    await execAsync(`ffmpeg -f lavfi -i "sine=frequency=1000:duration=10" -ar 44100 -ac 2 -b:a 128k "${testAudioPath}" -y`);
  });

  afterEach(() => {
    // Clean up
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (_error) {
      // Directory doesn't exist, that's fine
    }
  });

  test('extractAudioChunk - with forAnalysis=true downsamples to 16kbps mono', async () => {
    const chunkPath = await extractAudioChunk(testAudioPath, 0, 5, true);

    assert.ok(existsSync(chunkPath));
    assert.ok(chunkPath.includes('chunk_'));

    // Verify the chunk is downsampled using ffprobe
    const { stdout } = await execAsync(`ffprobe -v error -show_streams -of json "${chunkPath}"`);
    const info = JSON.parse(stdout);
    const audioStream = info.streams.find((s: any) => s.codec_type === 'audio');

    assert.strictEqual(audioStream.channels, 1, 'Should be mono');
    assert.strictEqual(audioStream.sample_rate, '16000', 'Should be 16kHz');

    // Clean up chunk
    rmSync(chunkPath);
  });

  test('extractAudioChunk - with forAnalysis=false copies without re-encoding', async () => {
    const chunkPath = await extractAudioChunk(testAudioPath, 0, 5, false);

    assert.ok(existsSync(chunkPath));

    // Verify the chunk maintains original properties
    const { stdout } = await execAsync(`ffprobe -v error -show_streams -of json "${chunkPath}"`);
    const info = JSON.parse(stdout);
    const audioStream = info.streams.find((s: any) => s.codec_type === 'audio');

    // Should maintain stereo and sample rate
    assert.strictEqual(audioStream.channels, 2, 'Should maintain stereo');
    assert.strictEqual(audioStream.sample_rate, '44100', 'Should maintain 44.1kHz');

    // Clean up chunk
    rmSync(chunkPath);
  });

  test('extractAudioChunk - file size comparison', async () => {
    const downsampledChunk = await extractAudioChunk(testAudioPath, 0, 5, true);
    const normalChunk = await extractAudioChunk(testAudioPath, 0, 5, false);

    const downsampledStats = await fsPromises.stat(downsampledChunk);
    const normalStats = await fsPromises.stat(normalChunk);

    // Downsampled should be significantly smaller
    assert.ok(downsampledStats.size < normalStats.size * 0.5, 'Downsampled file should be much smaller');

    // Clean up
    rmSync(downsampledChunk);
    rmSync(normalChunk);
  });

  test('timeToSeconds - handles all time formats', () => {
    assert.strictEqual(timeToSeconds('10'), 10);
    assert.strictEqual(timeToSeconds('1:30'), 90);
    assert.strictEqual(timeToSeconds('01:30'), 90);
    assert.strictEqual(timeToSeconds('1:00:00'), 3600);
    assert.strictEqual(timeToSeconds('2:30:45'), 9045);
    assert.strictEqual(timeToSeconds('00:00:00'), 0);
  });

  test('secondsToTime - converts to time format', () => {
    assert.strictEqual(secondsToTime(10), '00:10');
    assert.strictEqual(secondsToTime(90), '01:30');
    assert.strictEqual(secondsToTime(3600), '01:00:00');
    assert.strictEqual(secondsToTime(9045), '02:30:45');
    assert.strictEqual(secondsToTime(0), '00:00');
  });

  test('getAudioDuration - returns correct duration', async () => {
    const duration = await getAudioDuration(testAudioPath);
    
    // Should be close to 10 seconds (allowing for small variations)
    assert.ok(duration >= 9.9 && duration <= 10.1, `Duration should be ~10s, got ${duration}`);
  });

  test('removeAds - removes ad segments correctly', async () => {
    // Create a longer test file (30 seconds)
    const longTestPath = join(testDir, 'long-test.mp3');
    await execAsync(`ffmpeg -f lavfi -i "sine=frequency=1000:duration=30" -ar 44100 -ac 2 -b:a 128k "${longTestPath}" -y`);

    const outputPath = join(testDir, 'no-ads.mp3');
    const adSegments = [
      { start: '00:00:05', end: '00:00:10', confidence: 0.9 },
      { start: '00:00:20', end: '00:00:25', confidence: 0.95 }
    ];

    await removeAds(longTestPath, outputPath, adSegments);

    assert.ok(existsSync(outputPath));

    // Check duration - should be ~20s (30s - 10s of ads)
    const duration = await getAudioDuration(outputPath);
    assert.ok(duration >= 19.5 && duration <= 20.5, `Duration should be ~20s, got ${duration}`);
  });

  test('removeAds - handles no ad segments', async () => {
    const outputPath = join(testDir, 'copy.mp3');

    await removeAds(testAudioPath, outputPath, []);

    assert.ok(existsSync(outputPath));
    
    // Should have same duration as original
    const originalDuration = await getAudioDuration(testAudioPath);
    const copyDuration = await getAudioDuration(outputPath);
    
    assert.ok(Math.abs(originalDuration - copyDuration) < 0.1, 'Copy should have same duration');
  });

  test('removeAds - handles overlapping ad segments', async () => {
    const outputPath = join(testDir, 'overlap-test.mp3');
    const adSegments = [
      { start: '00:00:02', end: '00:00:05', confidence: 0.9 },
      { start: '00:00:04', end: '00:00:07', confidence: 0.95 } // Overlaps with first
    ];

    await removeAds(testAudioPath, outputPath, adSegments);

    assert.ok(existsSync(outputPath));
    
    // Should handle overlaps correctly
    const duration = await getAudioDuration(outputPath);
    assert.ok(duration >= 4.5 && duration <= 5.5, `Duration should be ~5s (10s - 5s merged overlap), got ${duration}`);
  });

  test('extractAudioChunk - handles edge cases', async () => {
    // Extract from end of file
    const chunkPath = await extractAudioChunk(testAudioPath, 8, 5, true);
    assert.ok(existsSync(chunkPath));

    // Should handle going past end gracefully
    const duration = await getAudioDuration(chunkPath);
    assert.ok(duration <= 2.5, 'Should only extract remaining audio');

    rmSync(chunkPath);
  });

  test('extractAudioChunk - creates unique temp files', async () => {
    // Extract multiple chunks simultaneously
    const chunks = await Promise.all([
      extractAudioChunk(testAudioPath, 0, 3, true),
      extractAudioChunk(testAudioPath, 1, 3, true),
      extractAudioChunk(testAudioPath, 2, 3, true)
    ]);

    // All paths should be unique
    const uniquePaths = new Set(chunks);
    assert.strictEqual(uniquePaths.size, 3, 'All chunk paths should be unique');

    // All files should exist
    chunks.forEach(chunk => {
      assert.ok(existsSync(chunk), `Chunk ${chunk} should exist`);
    });

    // Clean up
    chunks.forEach(chunk => rmSync(chunk));
  });
});