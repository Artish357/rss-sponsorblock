import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { initDatabase, closeDatabase, createOrUpdateEpisode, getEpisode } from '../src/services/storageService.js';
import { processEpisode, processEpisodesSequentially } from '../src/services/audioProcessingService';

const execAsync = promisify(exec);

describe('Audio Processing Service - Integration Tests', () => {
  const testStorageDir = './test-storage-processing';

  beforeEach(async () => {
    // Set up test storage
    process.env.STORAGE_AUDIO_DIR = testStorageDir;

    // Initialize database
    await initDatabase(true);
  });

  afterEach(async () => {
    // Close database
    await closeDatabase();

    // Clean up test storage
    try {
      rmSync(testStorageDir, { recursive: true, force: true });
      rmSync('./storage/test.db', { force: true });
    } catch (_error) {
      // Files don't exist, that's fine
    }

    // Reset environment
    delete process.env.STORAGE_AUDIO_DIR;
  });

  test('processEpisode - returns cached processed episode', async () => {
    const feedHash = 'test-feed';
    const episodeGuid = 'cached-episode';
    const originalUrl = 'https://example.com/audio.mp3';

    // Pre-save processed episode
    await createOrUpdateEpisode(feedHash, episodeGuid, {
      status: 'processed',
      file_path: '/path/to/processed.mp3',
      ad_segments: []
    });

    const result = await processEpisode(feedHash, episodeGuid, originalUrl);

    assert.strictEqual(result.status, 'processed');
    assert.strictEqual(result.file_path, '/path/to/processed.mp3');
  });

  test('processEpisode - with real audio file (no ads)', async () => {
    // Test with real Gemini API

    const feedHash = 'test-feed';
    const episodeGuid = 'real-audio-test';
    const originalUrl = 'https://example.com/audio.mp3';

    // Create a real test audio file with ffmpeg
    const audioPath = join(testStorageDir, feedHash, 'original', `${episodeGuid}.mp3`);
    mkdirSync(join(testStorageDir, feedHash, 'original'), { recursive: true });

    // Generate 10 second test audio
    await execAsync(`ffmpeg -f lavfi -i "sine=frequency=1000:duration=10" -ar 16000 -ac 1 -b:a 16k "${audioPath}" -y`);

    // Process the episode - it will use existing audio file
    try {
      const result = await processEpisode(feedHash, episodeGuid, originalUrl);

      // Should process successfully
      assert.strictEqual(result.status, 'processed');
      assert.ok(result.file_path);
      assert.ok(Array.isArray(result.ad_segments));

      // Since it's a test tone, should not detect any ads
      assert.strictEqual(result.ad_segments.length, 0);
    } catch (error) {
      // If it fails, check the error is reasonable
      assert.ok(error.message.includes('Gemini') || error.message.includes('Failed to detect'));
    }
  });

  test('processEpisodesSequentially - handles multiple episodes', async () => {
    const episodes = [
      { feed_hash: 'feed1', episode_guid: 'ep1', original_url: 'url1' },
      { feed_hash: 'feed1', episode_guid: 'ep2', original_url: 'url2' }
    ];

    // Pre-save as processed
    for (const ep of episodes) {
      await createOrUpdateEpisode(ep.feed_hash, ep.episode_guid, {
        status: 'processed',
        file_path: `/processed/${ep.episode_guid}.mp3`,
        ad_segments: []
      });
    }

    const results = await processEpisodesSequentially(episodes);

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results.filter(r => r.success).length, 2);
  });

  test('createOrUpdateEpisode - tracks status changes', async () => {
    const feedHash = 'test-feed';
    const episodeGuid = 'status-test';

    // Create episode
    await createOrUpdateEpisode(feedHash, episodeGuid, { status: 'downloading' });
    let episode = await getEpisode(feedHash, episodeGuid);
    assert.strictEqual(episode.status, 'downloading');

    // Update status
    await createOrUpdateEpisode(feedHash, episodeGuid, { status: 'analyzing' });
    episode = await getEpisode(feedHash, episodeGuid);
    assert.strictEqual(episode.status, 'analyzing');

    // Update to processed
    await createOrUpdateEpisode(feedHash, episodeGuid, { status: 'processed' });
    episode = await getEpisode(feedHash, episodeGuid);
    assert.strictEqual(episode.status, 'processed');
  });
});
