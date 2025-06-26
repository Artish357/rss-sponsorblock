import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { initDatabase, createOrUpdateEpisode, getEpisode, closeDatabase } from '../src/services/storageService';
import { unlinkSync } from 'fs';
import { join } from 'path';
import knex from 'knex';
import knexConfig from '../knexfile.js';

describe('Storage Service', () => {
  beforeEach(async () => {
    // Initialize database in test mode
    await initDatabase(true);
  });

  afterEach(async () => {
    // Close database connection
    await closeDatabase();

    // Clean up test database and migrations
    try {
      const db = knex(knexConfig.test);
      await db.migrate.rollback();
      await db.destroy();
    } catch (_error) {
      // Ignore errors during cleanup
    }

    try {
      unlinkSync(join('./storage', 'test.db'));
    } catch (_error) {
      // File doesn't exist, that's fine
    }
  });

  test('initDatabase - initializes without error', async () => {
    // Already initialized in beforeEach, just verify no errors
    assert.ok(true);
  });

  test('createOrUpdateEpisode and getEpisode - stores and retrieves episode data', async () => {

    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';
    const testData = {
      original_url: 'https://example.com/secret-audio.mp3',
      file_path: null
    };

    // Save episode
    const saved = await createOrUpdateEpisode(feedHash, episodeGuid, testData);
    assert.strictEqual(saved.original_url, testData.original_url);
    assert.strictEqual(saved.feed_hash, feedHash);
    assert.strictEqual(saved.episode_guid, episodeGuid);

    // Retrieve episode
    const retrieved = await getEpisode(feedHash, episodeGuid);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.original_url, testData.original_url);
    assert.strictEqual(retrieved.feed_hash, feedHash);
    assert.strictEqual(retrieved.episode_guid, episodeGuid);
  });

  test('getEpisode - returns null for non-existent episode', async () => {
    const result = await getEpisode('non-existent', 'episode');
    assert.strictEqual(result, null);
  });

  test('createOrUpdateEpisode - overwrites existing episode data', async () => {
    const feedHash = 'test-feed-2';
    const episodeGuid = 'test-episode-2';

    // Save initial data
    await createOrUpdateEpisode(feedHash, episodeGuid, {
      original_url: 'https://example.com/first.mp3'
    });

    // Overwrite with new data
    await createOrUpdateEpisode(feedHash, episodeGuid, {
      original_url: 'https://example.com/updated.mp3',
      file_path: '/path/to/processed.mp3'
    });

    const result = await getEpisode(feedHash, episodeGuid);
    assert.ok(result);
    assert.strictEqual(result.original_url, 'https://example.com/updated.mp3');
    assert.strictEqual(result.file_path, '/path/to/processed.mp3');
  });

  test('createOrUpdateEpisode and getEpisode - handles ad segments JSON', async () => {

    const feedHash = 'test-feed-3';
    const episodeGuid = 'test-episode-3';
    const adSegments = [
      { start: 0, end: 30, type: 'sponsor' as const },
      { start: 600, end: 660, type: 'ad' as const }
    ];

    // Save episode with ad segments
    await createOrUpdateEpisode(feedHash, episodeGuid, {
      original_url: 'https://example.com/audio.mp3',
      file_path: '/path/to/processed.mp3',
      ad_segments: adSegments
    });

    // Retrieve and verify
    const result = await getEpisode(feedHash, episodeGuid);
    assert.ok(result);
    assert.deepStrictEqual(result.ad_segments, adSegments);
  });
});