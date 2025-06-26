import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { downloadAudio, getExistingAudioPath } from '../src/services/audioDownloadService';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import http from 'http';

describe('Audio Download Service', () => {
  let server: http.Server;
  let serverUrl: string;
  const testStorageDir = './temp/test-storage-download';

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

    await new Promise<void>(resolve => {
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          serverUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Clean up test server
    await new Promise<void>(resolve => server.close(() => resolve()));

    // Clean up test storage
    try {
      rmSync(testStorageDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore
    }

    // Clean up env
    delete process.env.STORAGE_AUDIO_DIR;
  });

  test('downloadAudio - successfully downloads audio file', async () => {
    const url = `${serverUrl}/audio.mp3`;
    const feedHash = 'test-feed-123';
    const episodeGuid = 'episode-456';

    const filePath = await downloadAudio(url, feedHash, episodeGuid);

    assert.ok(filePath);
    assert.ok(existsSync(filePath));
    assert.ok(filePath.includes(feedHash));
    assert.ok(filePath.includes(episodeGuid));
    assert.ok(filePath.endsWith('.mp3'));
  });

  test('downloadAudio - handles non-audio content with warning', async () => {
    const url = `${serverUrl}/not-audio`;
    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';

    // Should still download but warn
    const filePath = await downloadAudio(url, feedHash, episodeGuid);
    assert.ok(existsSync(filePath));
  });

  test('downloadAudio - handles 404 errors', async () => {
    const url = `${serverUrl}/not-found`;
    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';

    await assert.rejects(
      downloadAudio(url, feedHash, episodeGuid),
      /Download failed: Request failed with status code 404/
    );
  });

  test('downloadAudio - handles timeout', async () => {
    const url = `${serverUrl}/timeout`;
    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';

    // Set a shorter timeout for testing
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
    const expectedPath = join(testStorageDir, feedHash, 'original', `${episodeGuid}.mp3`);

    // Create the file
    mkdirSync(join(testStorageDir, feedHash, 'original'), { recursive: true });
    writeFileSync(expectedPath, 'test content');

    const result = getExistingAudioPath(feedHash, episodeGuid);
    assert.strictEqual(result, expectedPath);
  });

  test('getExistingAudioPath - returns null when file does not exist', () => {
    const result = getExistingAudioPath('non-existent', 'episode');
    assert.strictEqual(result, null);
  });

  test('downloadAudio - creates nested directory structure', async () => {
    const url = `${serverUrl}/audio.mp3`;
    const feedHash = 'deep/nested/feed';
    const episodeGuid = 'episode';

    const filePath = await downloadAudio(url, feedHash, episodeGuid);

    assert.ok(existsSync(filePath));
    assert.ok(filePath.includes('deep/nested/feed'));
  });

  test('downloadAudio - handles network errors gracefully', async () => {
    const url = 'http://invalid-domain-that-does-not-exist.com/audio.mp3';
    const feedHash = 'test-feed';
    const episodeGuid = 'test-episode';

    await assert.rejects(
      downloadAudio(url, feedHash, episodeGuid),
      /ENOTFOUND|EAI_AGAIN|getaddrinfo/
    );
  });
});