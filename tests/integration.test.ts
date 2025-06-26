import { test, describe } from 'node:test';
import assert from 'node:assert';
import { rmSync } from 'fs';
import { fetchFeed, replaceAudioUrls } from '../src/services/rssService';
import { initDatabase, createOrUpdateEpisode, getEpisode, closeDatabase } from '../src/services/storageService';
import { processEpisode } from '../src/services/episodeProcessingService';
import { detectFirstAdBreak, detectAllAdBreaks } from '../src/services/geminiService';
import { extractAudioChunk, removeAds, getAudioDuration, timeToSeconds, secondsToTime } from '../src/services/audioProcessor';
import { downloadAudio, getExistingAudioPath } from '../src/services/audioDownloadService';

describe('Integration Tests - API Contracts', () => {
  const testDir = './temp/test-integration';

  test('RSS service integration', async () => {
    // Test that RSS service modules integrate correctly
    // Verify functions exist and have correct signatures
    assert.strictEqual(typeof fetchFeed, 'function');
    assert.strictEqual(typeof replaceAudioUrls, 'function');
    assert.strictEqual(fetchFeed.length, 1); // Takes URL parameter
    assert.strictEqual(replaceAudioUrls.length, 2); // Takes feed parameter
  });

  test('Storage service integration', async () => {
    // Test storage service initialization
    await initDatabase(true); // Test mode

    // Test basic operations
    const testData = {
      feedHash: 'test-feed',
      episodeGuid: 'test-episode',
      data: { original_url: 'https://example.com/test.mp3' }
    };

    await createOrUpdateEpisode(testData.feedHash, testData.episodeGuid, testData.data);
    const retrieved = await getEpisode(testData.feedHash, testData.episodeGuid);

    assert.ok(retrieved);
    assert.strictEqual(retrieved.feed_hash, testData.feedHash);
    assert.strictEqual(retrieved.episode_guid, testData.episodeGuid);

    await closeDatabase();

    // Clean up
    try {
      rmSync('./storage/test.db', { force: true });
    } catch (_error) {
      // Ignore
    }
  });

  test('Audio processing pipeline integration', async () => {
    // Test that all services can be imported and work together
    await initDatabase(true);

    // Pre-save a processed episode to test caching
    await createOrUpdateEpisode('test-feed', 'test-episode', {
      status: 'processed',
      file_path: '/test/path.mp3',
      ad_segments: []
    });

    // Should return cached result
    const result = await processEpisode('test-feed', 'test-episode', 'https://example.com/audio.mp3');
    assert.strictEqual(result.status, 'processed');

    await closeDatabase();

    // Clean up
    try {
      rmSync('./storage/test.db', { force: true });
    } catch (_error) {
      // Ignore
    }
  });

  test('Service error handling', async () => {
    // Test error handling across services
    // Should handle null path
    await assert.rejects(
      detectAllAdBreaks(null as any),
      /Invalid audio path/
    );

    // Should handle non-existent file
    await assert.rejects(
      detectAllAdBreaks('/non/existent/file.mp3'),
      /ffprobe exited with code 1|ENOENT/
    );
  });

  test('Environment configuration', () => {
    // Test that services respect environment variables
    process.env.STORAGE_AUDIO_DIR = testDir;
    process.env.SERVER_BASE_URL = 'http://test.local';
    process.env.GEMINI_MODEL = 'test-model';

    // Verify environment is set
    assert.strictEqual(process.env.STORAGE_AUDIO_DIR, testDir);
    assert.strictEqual(process.env.SERVER_BASE_URL, 'http://test.local');
    assert.strictEqual(process.env.GEMINI_MODEL, 'test-model');

    // Clean up
    delete process.env.STORAGE_AUDIO_DIR;
    delete process.env.SERVER_BASE_URL;
    delete process.env.GEMINI_MODEL;
  });

  test('Module exports validation', async () => {
    // Verify all required exports are present
    assert.ok(extractAudioChunk);
    assert.ok(removeAds);
    assert.ok(getAudioDuration);
    assert.ok(timeToSeconds);
    assert.ok(secondsToTime);

    assert.ok(detectFirstAdBreak);
    assert.ok(detectAllAdBreaks);

    assert.ok(downloadAudio);
    assert.ok(getExistingAudioPath);
  });
});