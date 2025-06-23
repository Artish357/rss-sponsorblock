import { test, describe } from 'node:test';
import assert from 'node:assert';
import { initDatabase, saveEpisode, getEpisode } from '../src/services/storageService.js';

describe('Storage Service', () => {
  test('initDatabase - initializes without error', async () => {
    await assert.doesNotReject(initDatabase());
  });

  test('saveEpisode and getEpisode - stores and retrieves episode data', async () => {
    await initDatabase();
    
    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';
    const testData = {
      originalUrl: 'https://example.com/secret-audio.mp3',
      filePath: null
    };

    // Save episode
    const saved = await saveEpisode(feedHash, episodeGuid, testData);
    assert.strictEqual(saved.originalUrl, testData.originalUrl);
    assert.strictEqual(saved.feedHash, feedHash);
    assert.strictEqual(saved.episodeGuid, episodeGuid);

    // Retrieve episode
    const retrieved = await getEpisode(feedHash, episodeGuid);
    assert.strictEqual(retrieved.originalUrl, testData.originalUrl);
    assert.strictEqual(retrieved.feedHash, feedHash);
    assert.strictEqual(retrieved.episodeGuid, episodeGuid);
  });

  test('getEpisode - returns null for non-existent episode', async () => {
    await initDatabase();
    
    const result = await getEpisode('non-existent', 'episode');
    assert.strictEqual(result, null);
  });

  test('saveEpisode - overwrites existing episode data', async () => {
    await initDatabase();
    
    const feedHash = 'test-feed-2';
    const episodeGuid = 'test-episode-2';
    
    // Save initial data
    await saveEpisode(feedHash, episodeGuid, {
      originalUrl: 'https://example.com/first.mp3'
    });
    
    // Overwrite with new data
    await saveEpisode(feedHash, episodeGuid, {
      originalUrl: 'https://example.com/updated.mp3',
      filePath: '/path/to/processed.mp3'
    });
    
    const result = await getEpisode(feedHash, episodeGuid);
    assert.strictEqual(result.originalUrl, 'https://example.com/updated.mp3');
    assert.strictEqual(result.filePath, '/path/to/processed.mp3');
  });
});