import express from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// Initialize storage service
import { initDatabase } from './services/storageService.js';
await initDatabase();

// RSS proxy route
app.get('/feed', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'RSS URL required' });
  }

  try {
    const { fetchFeed, replaceAudioUrls } = await import('./services/rssService.js');
    const { saveEpisode } = await import('./services/storageService.js');
    
    // Fetch and parse RSS feed
    const feed = await fetchFeed(url);
    console.log(`Fetched RSS feed: ${feed.title} (${feed.episodes.length} episodes)`);
    
    // Store episode metadata with original URLs (secure internal storage)
    for (const episode of feed.episodes) {
      await saveEpisode(feed.feedHash, episode.guid, {
        originalUrl: episode.audioUrl
      });
    }
    
    // Replace audio URLs with local proxy URLs (no original URLs exposed)
    const modifiedXml = await replaceAudioUrls(feed);
    
    // TODO: Queue first 3 episodes for background processing
    
    res.type('application/rss+xml').send(modifiedXml);
  } catch (error) {
    console.error('Error processing RSS feed:', error);
    res.status(500).json({ error: 'Failed to process RSS feed' });
  }
});

// Secure audio serving route - uses internal IDs only
app.get('/audio/:feedHash/:episodeGuid.mp3', async (req, res) => {
  const { feedHash, episodeGuid } = req.params;
  
  try {
    const { getEpisode } = await import('./services/storageService.js');
    
    // Look up episode metadata using internal IDs
    const episode = await getEpisode(feedHash, decodeURIComponent(episodeGuid));
    
    if (!episode) {
      return res.status(404).json({ error: 'Episode not found' });
    }
    
    // Original URL is now securely stored internally, never exposed to client
    console.log(`Audio request for: ${episode.originalUrl}`);
    
    // TODO: Implement audio processing and serving using episode.originalUrl
    res.status(501).json({ 
      error: 'Audio processing not implemented yet',
      debug: `Episode found: ${episode.episodeGuid}` 
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
  console.log(`Podmirror server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});