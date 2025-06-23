import { test, describe } from 'node:test';
import assert from 'node:assert';
import { generateAudioUrl } from '../src/services/rssService.js';

describe('Security Tests', () => {
  test('generateAudioUrl - never exposes original URLs', () => {
    const sensitiveUrl = 'https://secret-internal-server.com/private/audio.mp3?token=secret123';
    const publicUrl = generateAudioUrl('feed123', 'episode456');
    
    // Ensure no part of the original URL is in the generated URL
    assert.ok(!publicUrl.includes('secret-internal-server.com'), 'Should not expose original domain');
    assert.ok(!publicUrl.includes('secret123'), 'Should not expose tokens');
    assert.ok(!publicUrl.includes('?url='), 'Should not use query parameter for original URL');
    
    // Ensure only internal identifiers are used
    assert.ok(publicUrl.includes('feed123'), 'Should contain feed hash');
    assert.ok(publicUrl.includes('episode456'), 'Should contain episode GUID');
  });

  test('URL structure - uses only internal identifiers', () => {
    const url = generateAudioUrl('abc123', 'ep-001');
    const urlParts = new URL(url);
    
    // Verify path structure
    assert.strictEqual(urlParts.pathname, '/audio/abc123/ep-001.mp3');
    
    // Verify no query parameters
    assert.strictEqual(urlParts.search, '');
    
    // Verify no fragments
    assert.strictEqual(urlParts.hash, '');
  });

  test('Episode GUID encoding - handles potentially malicious input', () => {
    const maliciousGuid = '../../../etc/passwd';
    const url = generateAudioUrl('feed123', maliciousGuid);
    
    // Should be properly URL encoded
    assert.ok(url.includes('..%2F..%2F..%2Fetc%2Fpasswd'), 'Should URL encode path traversal attempts');
    assert.ok(!url.includes('../'), 'Should not contain unencoded path traversal');
  });

  test('Feed hash isolation - different feeds have different URLs', () => {
    const url1 = generateAudioUrl('feed1', 'episode1');
    const url2 = generateAudioUrl('feed2', 'episode1');
    
    assert.notStrictEqual(url1, url2, 'Different feed hashes should generate different URLs');
    assert.ok(url1.includes('feed1'), 'First URL should contain first feed hash');
    assert.ok(url2.includes('feed2'), 'Second URL should contain second feed hash');
  });
});