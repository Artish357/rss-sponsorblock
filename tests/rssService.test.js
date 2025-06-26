import { test, describe } from 'node:test';
import assert from 'node:assert';
import { fetchFeed, replaceAudioUrls, generateAudioUrl } from '../src/services/rssService';

describe('RSS Service', () => {
  test('generateAudioUrl - creates secure URL without original URL', () => {
    const url = generateAudioUrl('abc123', 'episode-1');

    assert.strictEqual(url, 'http://localhost:3000/audio/abc123/episode-1.mp3');
    assert.ok(!url.includes('?url='), 'URL should not contain query parameter');
  });

  test('generateAudioUrl - handles special characters in episode GUID', () => {
    const url = generateAudioUrl('abc123', 'episode with spaces & symbols!');

    assert.ok(url.includes('episode%20with%20spaces%20%26%20symbols!'), 'Should URL encode episode GUID');
  });

  test('replaceAudioUrls - replaces URLs without exposing originals', async () => {
    const mockRss = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Test Podcast</title>
          <item>
            <enclosure url="https://example.com/original.mp3" type="audio/mpeg"/>
          </item>
        </channel>
      </rss>`;

    const mockFeed = {
      feedHash: 'test123',
      episodes: [{
        guid: 'ep1',
        audioUrl: 'https://example.com/original.mp3'
      }],
      originalXml: mockRss
    };

    const result = await replaceAudioUrls(mockFeed);

    assert.ok(result.includes('/audio/test123/ep1.mp3'), 'Should contain local URL');
    assert.ok(!result.includes('example.com/original.mp3'), 'Should not expose original URL');
  });

  test('fetchFeed - handles missing RSS elements gracefully', async () => {
    // Mock fetch for testing (would use proper mocking in real implementation)
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      ok: true,
      text: async () => `<?xml version="1.0"?>
        <rss version="2.0">
          <channel>
            <title>Test</title>
            <item>
              <enclosure url="test.mp3" type="audio/mpeg"/>
            </item>
          </channel>
        </rss>`
    });

    try {
      const result = await fetchFeed('https://test.com/feed.xml');
      assert.strictEqual(result.title, 'Test');
      assert.strictEqual(result.episodes.length, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
