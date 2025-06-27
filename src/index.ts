import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { initDatabase, createOrUpdateEpisode, getEpisode } from './services/storageService';
import { fetchFeed, replaceAudioUrls, stripOutSelfLinks } from './services/rssService';
import { processEpisodesSequentially, processEpisode } from './services/episodeProcessingService';
import type { Episode } from './types';

dotenv.config();

const app = express();
const HOST = process.env.SERVER_HOST || 'localhost';
const PORT = parseInt(process.env.SERVER_PORT ?? '') || 3000;

// Initialize storage service
await initDatabase();

// Processing locks to prevent duplicate processing
const processingLocks = new Map<string, Promise<Episode>>();

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Secure audio serving route - uses internal IDs only
app.get('/audio/:feedHash/:episodeGuid.mp3', async (req: Request, res: Response): Promise<void> => {
  const { feedHash, episodeGuid } = req.params;
  const decodedGuid = decodeURIComponent(episodeGuid);
  const lockKey = `${feedHash}:${decodedGuid}`;

  try {
    // Look up episode metadata using internal IDs
    const episode = await getEpisode(feedHash, decodedGuid);

    if (!episode) {
      res.status(404).json({ error: 'Episode not found' });
      return;
    }

    // If already processed, serve the file
    if (episode.status === 'processed' && episode.file_path) {
      console.log(`Serving processed audio: ${episode.file_path}`);
      res.sendFile(episode.file_path, { root: process.cwd() });
      return;
    }

    // Start processing if not already started
    if (!processingLocks.has(lockKey) && (episode.status === 'pending' || episode.status === 'error')) {
      console.log(`Starting audio processing for: ${decodedGuid}`);

      const processingPromise = processEpisode(feedHash, decodedGuid, episode.original_url);

      // Store promise in locks map
      processingLocks.set(lockKey, processingPromise);
      processingPromise.finally(()=>{
        processingLocks.delete(lockKey);
      });
    }

    // If processing is in progress, wait for it
    if (processingLocks.has(lockKey)) {
      console.log(`Waiting for processing to complete: ${lockKey}`);
      try {
        await processingLocks.get(lockKey);
        // Re-fetch episode after processing
        const processed = await getEpisode(feedHash, decodedGuid);
        if (processed && processed.file_path) {
          res.sendFile(processed.file_path, { root: process.cwd() });
          return;
        }
      } catch (error) {
        console.error('Processing failed:', error);
        res.status(500).json({ error: 'Audio processing failed' });
        return;
      }
    }

    console.log('Other status:', episode);
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


// RSS proxy route
app.get('/*', async (req: Request, res: Response): Promise<void> => {
  const url = req.url.replace('/', '');

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'RSS URL required' });
    return;
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
    const modifiedXml = await stripOutSelfLinks(await replaceAudioUrls(feed, req.get('host')!));

    // Queue first 3 episodes for background processing
    const episodesToProcess = feed.episodes.slice(0, 3).map(ep => ({
      feed_hash: feed.feedHash,
      episode_guid: ep.guid,
      original_url: ep.audioUrl
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

app.listen(PORT, HOST, () => {
  console.log(`RSS SponsorBlock server running on port ${PORT}`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
});