import express from 'express';
import dotenv from 'dotenv';
import { initDatabase, createOrUpdateEpisode, getEpisode } from './services/storageService';
import { fetchFeed, replaceAudioUrls } from './services/rssService';
import { processEpisodesSequentially, processEpisode } from './services/audioProcessingService';

dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// Initialize storage service
await initDatabase();

// RSS proxy route
app.get('/feed', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'RSS URL required' });
  }

  try {
    // Fetch and parse RSS feed
    const feed = await fetchFeed(url);
    console.log(`Fetched RSS feed: ${feed.title} (${feed.episodes.length} episodes)`);

    // Store episode metadata with original URLs (secure internal storage)
    for (const episode of feed.episodes) {
      await createOrUpdateEpisode(feed.feedHash, episode.guid, {
        original_url: episode.audioUrl
      });
    }

    // Replace audio URLs with local proxy URLs (no original URLs exposed)
    const modifiedXml = await replaceAudioUrls(feed);

    // Queue first 3 episodes for background processing
    const episodesToProcess = feed.episodes.slice(0, 3).map(ep => ({
      feedHash: feed.feedHash,
      episodeGuid: ep.guid,
      originalUrl: ep.audioUrl
    }));

    // Process in background without blocking response
    processEpisodesSequentially(episodesToProcess)
      .then(results => {
        const successful = results.filter(r => r.success).length;
        console.log(`Pre-processing complete: ${successful}/${results.length} episodes processed`);
      })
      .catch(error => {
        console.error('Pre-processing failed:', error);
      });

    res.type('application/rss+xml').send(modifiedXml);
  } catch (error) {
    console.error('Error processing RSS feed:', error);
    res.status(500).json({ error: 'Failed to process RSS feed' });
  }
});

// Processing locks to prevent duplicate processing
const processingLocks = new Map();

// Secure audio serving route - uses internal IDs only
app.get('/audio/:feedHash/:episodeGuid.mp3', async (req, res) => {
  const { feedHash, episodeGuid } = req.params;
  const decodedGuid = decodeURIComponent(episodeGuid);
  const lockKey = `${feedHash}:${decodedGuid}`;

  try {
    // Look up episode metadata using internal IDs
    const episode = await getEpisode(feedHash, decodedGuid);

    if (!episode) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    // If already processed, serve the file
    if (episode.status === 'processed' && episode.file_path) {
      console.log(`Serving processed audio: ${episode.file_path}`);
      return res.sendFile(episode.file_path, { root: process.cwd() });
    }

    // If processing is in progress, wait for it
    if (processingLocks.has(lockKey)) {
      console.log(`Waiting for processing to complete: ${lockKey}`);
      try {
        await processingLocks.get(lockKey);
        // Re-fetch episode after processing
        const processed = await getEpisode(feedHash, decodedGuid);
        if (processed && processed.file_path) {
          return res.sendFile(processed.file_path, { root: process.cwd() });
        }
      } catch (error) {
        console.error('Processing failed:', error);
        return res.status(500).json({ error: 'Audio processing failed' });
      }
    }

    // Start processing if not already started
    if (episode.status === 'pending' || episode.status === 'error') {
      console.log(`Starting audio processing for: ${decodedGuid}`);

      const processingPromise = processEpisode(feedHash, decodedGuid, episode.original_url);

      // Store promise in locks map
      processingLocks.set(lockKey, processingPromise);

      try {
        const result = await processingPromise;
        return res.sendFile(result.file_path, { root: process.cwd() });
      } finally {
        // Clean up lock
        processingLocks.delete(lockKey);
      }
    }

    // Other statuses (downloading, analyzing, processing)
    res.status(202).json({
      status: episode.status,
      message: `Episode is currently ${episode.status}. Please try again later.`
    });
  } catch (error) {
    console.error('Error serving audio:', error);
    res.status(500).json({ error: 'Failed to serve audio' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`RSS SponsorBlock server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
