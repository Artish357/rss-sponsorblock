import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { extractAudioChunk, removeAds, getAudioDuration, timeToSeconds, secondsToTime } from '../src/services/audioProcessor.js';
import { mkdirSync, rmSync, writeFileSync, existsSync, promises as fsPromises } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Audio Processor - Downsampling Feature', () => {
  const testDir = './test-audio-processor';
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
    } catch (error) {
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
    const audioStream = info.streams.find(s => s.codec_type === 'audio');
    
    assert.strictEqual(audioStream.channels, 1, 'Should be mono');
    assert.strictEqual(audioStream.sample_rate, '16000', 'Should be 16kHz');
    
    // Clean up chunk
    rmSync(chunkPath);
  });

  test('extractAudioChunk - with forAnalysis=false copies without re-encoding', async () => {
    const chunkPath = await extractAudioChunk(testAudioPath, 0, 5, false);
    
    assert.ok(existsSync(chunkPath));
    
    // Verify the chunk maintains original quality
    const { stdout: originalInfo } = await execAsync(`ffprobe -v error -show_streams -of json "${testAudioPath}"`);
    const { stdout: chunkInfo } = await execAsync(`ffprobe -v error -show_streams -of json "${chunkPath}"`);
    
    const originalAudio = JSON.parse(originalInfo).streams.find(s => s.codec_type === 'audio');
    const chunkAudio = JSON.parse(chunkInfo).streams.find(s => s.codec_type === 'audio');
    
    assert.strictEqual(chunkAudio.channels, originalAudio.channels, 'Should maintain channels');
    assert.strictEqual(chunkAudio.sample_rate, originalAudio.sample_rate, 'Should maintain sample rate');
    
    // Clean up chunk
    rmSync(chunkPath);
  });

  test('extractAudioChunk - file size comparison', async () => {
    // Extract same chunk with and without analysis flag
    const analysisChunk = await extractAudioChunk(testAudioPath, 0, 5, true);
    const normalChunk = await extractAudioChunk(testAudioPath, 0, 5, false);
    
    const { size: analysisSize } = await fsPromises.stat(analysisChunk);
    const { size: normalSize } = await fsPromises.stat(normalChunk);
    
    // Downsampled should be significantly smaller
    const sizeReduction = ((normalSize - analysisSize) / normalSize) * 100;
    assert.ok(sizeReduction > 50, `Size reduction should be > 50%, got ${sizeReduction.toFixed(1)}%`);
    
    // Clean up
    rmSync(analysisChunk);
    rmSync(normalChunk);
  });

  test('timeToSeconds - handles all time formats', () => {
    // Test SS format
    assert.strictEqual(timeToSeconds('45'), 45);
    assert.strictEqual(timeToSeconds('5'), 5);
    assert.strictEqual(timeToSeconds('0'), 0);
    
    // Test MM:SS format
    assert.strictEqual(timeToSeconds('2:30'), 150);
    assert.strictEqual(timeToSeconds('10:00'), 600);
    assert.strictEqual(timeToSeconds('0:45'), 45);
    
    // Test HH:MM:SS format
    assert.strictEqual(timeToSeconds('1:30:00'), 5400);
    assert.strictEqual(timeToSeconds('0:02:30'), 150);
    assert.strictEqual(timeToSeconds('10:15:30'), 36930);
  });

  test('secondsToTime - converts to time format', () => {
    assert.strictEqual(secondsToTime(45), '00:45');
    assert.strictEqual(secondsToTime(150), '02:30');
    assert.strictEqual(secondsToTime(3661), '01:01:01');
    assert.strictEqual(secondsToTime(36930), '10:15:30');
    assert.strictEqual(secondsToTime(0), '00:00');
  });

  test('getAudioDuration - returns correct duration', async () => {
    const duration = await getAudioDuration(testAudioPath);
    
    // Test audio is 10 seconds
    assert.ok(duration >= 9.9 && duration <= 10.1, `Duration should be ~10s, got ${duration}`);
  });

  test('removeAds - removes ad segments correctly', async () => {
    // Create a longer test file (30 seconds)
    const longAudioPath = join(testDir, 'long-test.mp3');
    await execAsync(`ffmpeg -f lavfi -i "sine=frequency=1000:duration=30" -ar 44100 -ac 2 -b:a 128k "${longAudioPath}" -y`);
    
    const outputPath = join(testDir, 'no-ads.mp3');
    const adSegments = [
      { start: '00:00:05', end: '00:00:10' },  // 5-10s
      { start: '00:00:20', end: '00:00:25' }   // 20-25s
    ];
    
    await removeAds(longAudioPath, outputPath, adSegments);
    
    assert.ok(existsSync(outputPath));
    
    // Check duration - should be ~20s (30s - 10s of ads)
    const outputDuration = await getAudioDuration(outputPath);
    assert.ok(outputDuration >= 19.5 && outputDuration <= 20.5, `Output should be ~20s, got ${outputDuration}`);
  });

  test('removeAds - handles no ad segments', async () => {
    const outputPath = join(testDir, 'no-changes.mp3');
    
    await removeAds(testAudioPath, outputPath, []);
    
    assert.ok(existsSync(outputPath));
    
    // Duration should be unchanged
    const originalDuration = await getAudioDuration(testAudioPath);
    const outputDuration = await getAudioDuration(outputPath);
    assert.ok(Math.abs(originalDuration - outputDuration) < 0.1);
  });

  test('removeAds - handles overlapping ad segments', async () => {
    const outputPath = join(testDir, 'overlap-test.mp3');
    const adSegments = [
      { start: '00:00:02', end: '00:00:05' },
      { start: '00:00:04', end: '00:00:07' }  // Overlaps with first
    ];
    
    await removeAds(testAudioPath, outputPath, adSegments);
    
    assert.ok(existsSync(outputPath));
    
    // Should handle overlaps gracefully
    const outputDuration = await getAudioDuration(outputPath);
    assert.ok(outputDuration > 0);
  });

  test('extractAudioChunk - handles edge cases', async () => {
    const duration = await getAudioDuration(testAudioPath);
    
    // Test extracting beyond file duration
    const chunkPath = await extractAudioChunk(testAudioPath, duration - 2, 5, true);
    assert.ok(existsSync(chunkPath));
    
    // Chunk should be only 2 seconds
    const chunkDuration = await getAudioDuration(chunkPath);
    assert.ok(chunkDuration <= 2.5, `Chunk should be ~2s, got ${chunkDuration}`);
    
    rmSync(chunkPath);
  });

  test('extractAudioChunk - creates unique temp files', async () => {
    // Extract chunks with slight delays to ensure different timestamps
    const paths = [];
    for (let i = 0; i < 3; i++) {
      const path = await extractAudioChunk(testAudioPath, i, 3, true);
      paths.push(path);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // All paths should be unique
    const uniquePaths = new Set(paths);
    assert.strictEqual(uniquePaths.size, 3, 'All chunk paths should be unique');
    
    // Clean up
    for (const path of paths) {
      rmSync(path);
    }
  });
});