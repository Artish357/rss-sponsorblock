import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { initDatabase, closeDatabase, createOrUpdateEpisode, getEpisode } from '../src/services/storageService';
import { processEpisode, processEpisodesSequentially } from '../src/services/audioProcessingService';

const execAsync = promisify(exec);

describe('Audio Processing Service - Integration Tests', () => {
  const testStorageDir = './temp/test-storage-processing';

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
    const feedHash = 'test-feed';
    const episodeGuid = 'real-audio-test';
    const originalUrl = 'https://example.com/test.mp3';

    // Create the directory structure
    const originalDir = join(testStorageDir, feedHash, 'original');
    mkdirSync(originalDir, { recursive: true });

    // Create a real test audio file
    const audioPath = join(originalDir, `${episodeGuid}.mp3`);
    await execAsync(`ffmpeg -f lavfi -i "sine=frequency=1000:duration=10" -ar 44100 -ac 2 -b:a 128k "${audioPath}" -y`);

    // Mock that there are no ads
    process.env.MOCK_GEMINI = 'no-ads';

    const result = await processEpisode(feedHash, episodeGuid, originalUrl);

    assert.strictEqual(result.status, 'processed');
    assert.ok(result.file_path);
    assert.strictEqual(result.ad_segments?.length, 0);

    // Clean up
    delete process.env.MOCK_GEMINI;
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
    assert.strictEqual(episode?.status, 'downloading');

    // Update status
    await createOrUpdateEpisode(feedHash, episodeGuid, { status: 'analyzing' });
    episode = await getEpisode(feedHash, episodeGuid);
    assert.strictEqual(episode?.status, 'analyzing');

    // Final status
    await createOrUpdateEpisode(feedHash, episodeGuid, { status: 'processed' });
    episode = await getEpisode(feedHash, episodeGuid);
    assert.strictEqual(episode?.status, 'processed');
  });
});