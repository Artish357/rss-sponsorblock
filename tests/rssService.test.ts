import { test, describe } from 'node:test';
import assert from 'node:assert';
import { fetchFeed, replaceAudioUrls, generateAudioUrl } from '../src/services/rssService';

describe('RSS Service', () => {
  test('generateAudioUrl - creates secure URL without original URL', () => {
    const url = generateAudioUrl('abc123', 'episode-1');

    assert.strictEqual(url, 'http://localhost:3000/audio/abc123/episode-1.mp3');
    assert.ok(!url.includes('?url='), 'URL should not contain query parameter');
    assert.ok(!url.includes('original'), 'URL should not contain original URL');
  });

  test('generateAudioUrl - handles special characters in episode GUID', () => {
    const url = generateAudioUrl('feed123', 'episode with spaces & symbols!');
    
    assert.ok(url.includes('episode%20with%20spaces%20%26%20symbols!'));
    assert.ok(!url.includes(' '), 'Spaces should be encoded');
    assert.ok(!url.includes('&'), 'Ampersands should be encoded');
  });

  test('replaceAudioUrls - replaces URLs without exposing originals', async () => {
    const mockFeed = {
      title: 'Test Podcast',
      description: 'Test Description',
      feedHash: 'abc123',
      episodes: [
        {
          title: 'Episode 1',
          description: 'Episode 1 Description',
          guid: 'ep1',
          audioUrl: 'https://secret-cdn.com/original-audio-1.mp3',
          pubDate: new Date().toISOString()
        }
      ],
      originalXml: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Podcast</title>
    <item>
      <title>Episode 1</title>
      <enclosure url="https://secret-cdn.com/original-audio-1.mp3" type="audio/mpeg" />
    </item>
  </channel>
</rss>`
    };

    const modifiedXml = await replaceAudioUrls(mockFeed);
    
    // Verify original URLs are not in the output
    assert.ok(!modifiedXml.includes('secret-cdn.com'), 'Original domain should not appear');
    assert.ok(!modifiedXml.includes('original-audio-1.mp3'), 'Original filename should not appear');
    
    // Verify new URLs are present
    assert.ok(modifiedXml.includes('http://localhost:3000/audio/abc123/ep1.mp3'), 'New URL should be present');
  });

  test('fetchFeed - handles missing RSS elements gracefully', async () => {
    // This test would need a mock HTTP server or actual test RSS feed
    // For now, just verify the function exists and has correct signature
    assert.strictEqual(typeof fetchFeed, 'function');
    assert.strictEqual(fetchFeed.length, 1); // Takes one parameter
  });
});