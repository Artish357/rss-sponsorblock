import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { downloadAudio, getExistingAudioPath } from '../src/services/audioDownloadService.ts';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import http from 'http';

describe('Audio Download Service', () => {
  let server;
  let serverUrl;
  const testStorageDir = './test-storage-download';

  beforeEach(async () => {
    // Set up test storage directory
    process.env.STORAGE_AUDIO_DIR = testStorageDir;

    // Create a test HTTP server
    server = http.createServer((req, res) => {
      if (req.url === '/audio.mp3') {
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': '100'
        });
        res.end(Buffer.alloc(100, 'test-audio-content'));
      } else if (req.url === '/timeout') {
        // Simulate timeout by not responding
        setTimeout(() => {
          res.end();
        }, 10000);
      } else if (req.url === '/not-audio') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html>Not audio</html>');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    await new Promise(resolve => {
      server.listen(0, () => {
        const port = server.address().port;
        serverUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Clean up test server
    await new Promise(resolve => server.close(resolve));

    // Clean up test storage
    try {
      rmSync(testStorageDir, { recursive: true, force: true });
    } catch (_error) {
      // Directory doesn't exist, that's fine
    }

    // Reset environment
    delete process.env.STORAGE_AUDIO_DIR;
  });

  test('downloadAudio - successfully downloads audio file', async () => {
    const feedHash = 'test-feed-123';
    const episodeGuid = 'episode-456';
    const url = `${serverUrl}/audio.mp3`;

    const filePath = await downloadAudio(url, feedHash, episodeGuid);

    assert.ok(filePath.includes(feedHash));
    assert.ok(filePath.includes(episodeGuid));
    assert.ok(filePath.endsWith('.mp3'));
    assert.ok(existsSync(filePath));

    // Verify directory structure
    const expectedDir = join(testStorageDir, feedHash, 'original');
    assert.ok(existsSync(expectedDir));
  });

  test('downloadAudio - handles non-audio content with warning', async () => {
    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';
    const url = `${serverUrl}/not-audio`;

    // Should still download but log warning
    const filePath = await downloadAudio(url, feedHash, episodeGuid);
    assert.ok(existsSync(filePath));
  });

  test('downloadAudio - handles 404 errors', async () => {
    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';
    const url = `${serverUrl}/not-found`;

    await assert.rejects(
      downloadAudio(url, feedHash, episodeGuid),
      /Download failed/
    );
  });

  test('downloadAudio - handles timeout', async () => {
    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';
    const url = `${serverUrl}/timeout`;

    // Set short timeout for testing
    process.env.DOWNLOAD_TIMEOUT = '100';

    await assert.rejects(
      downloadAudio(url, feedHash, episodeGuid),
      /Download timeout exceeded/
    );

    delete process.env.DOWNLOAD_TIMEOUT;
  });

  test('getExistingAudioPath - returns path when file exists', () => {
    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';

    // Create the file
    const expectedPath = join(testStorageDir, feedHash, 'original', `${episodeGuid}.mp3`);
    mkdirSync(join(testStorageDir, feedHash, 'original'), { recursive: true });
    writeFileSync(expectedPath, 'test');

    const result = getExistingAudioPath(feedHash, episodeGuid);
    assert.strictEqual(result, expectedPath);
  });

  test('getExistingAudioPath - returns null when file does not exist', () => {
    const feedHash = 'test-feed';
    const episodeGuid = 'non-existent';

    const result = getExistingAudioPath(feedHash, episodeGuid);
    assert.strictEqual(result, null);
  });

  test('downloadAudio - creates nested directory structure', async () => {
    const feedHash = 'deep/nested/feed';
    const episodeGuid = 'episode';
    const url = `${serverUrl}/audio.mp3`;

    const filePath = await downloadAudio(url, feedHash, episodeGuid);

    assert.ok(existsSync(filePath));
    assert.ok(filePath.includes('deep/nested/feed'));
  });

  test('downloadAudio - handles network errors gracefully', async () => {
    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';
    const url = 'http://invalid-domain-that-does-not-exist.com/audio.mp3';

    await assert.rejects(
      downloadAudio(url, feedHash, episodeGuid),
      /Download failed/
    );
  });
});
