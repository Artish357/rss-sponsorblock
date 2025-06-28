import { Router, Request, Response } from 'express';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchDemoFeed, processDemoEpisode, getDemoStatus } from './demo.service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const processingLocks = new Map<string, Promise<any>>();
const activeKeys = new Set<string>(); // Track active API keys

// Serve demo page
router.get('/demo', (_req: Request, res: Response) => {
  res.sendFile('demo.html', { root: path.join(__dirname, 'public') });
});

// Fetch feed metadata
router.post('/demo/feed', async (req: Request, res: Response) => {
  const { feedUrl } = req.body;
  
  if (!feedUrl || typeof feedUrl !== 'string') {
    res.status(400).json({ error: 'Feed URL required' });
    return;
  }
  
  try {
    const feed = await fetchDemoFeed(feedUrl);
    res.json({
      feedHash: feed.feedHash,
      title: feed.title,
      episodes: feed.episodes.map(ep => ({
        guid: ep.guid,
        title: ep.title,
        audioUrl: ep.audioUrl,
        duration: ep.duration,
        artwork: ep.artwork
      }))
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Stream audio with on-demand processing
router.get('/demo/audio/:feedHash/:episodeGuid.mp3', async (req: Request, res: Response) => {
  const { feedHash, episodeGuid } = req.params;
  const decodedGuid = decodeURIComponent(episodeGuid);
  const apiKey = req.headers['x-gemini-api-key'] as string;
  const model = req.headers['x-gemini-model'] as string;
  const originalUrl = req.headers['x-original-url'] as string;
  const lockKey = `${feedHash}:${decodedGuid}`;
  
  // Validate required headers
  if (!apiKey || !model) {
    res.status(400).json({ error: 'API key and model required' });
    return;
  }
  
  // Check if already processed
  const filePath = path.join(process.cwd(), 'storage', 'audio', feedHash, 'processed', `${decodedGuid}.mp3`);
  if (existsSync(filePath)) {
    console.log(`Serving processed demo audio: ${filePath}`);
    res.sendFile(filePath);
    return;
  }
  
  // Enforce one episode at a time per API key
  if (activeKeys.has(apiKey)) {
    res.status(429).json({ 
      error: 'Another episode is already processing with this API key' 
    });
    return;
  }
  
  // Need original URL for processing
  if (!originalUrl) {
    res.status(400).json({ error: 'Original URL required for processing' });
    return;
  }
  
  // Process with lock
  if (!processingLocks.has(lockKey)) {
    console.log(`Starting demo processing for: ${decodedGuid}`);
    activeKeys.add(apiKey);
    
    const promise = processDemoEpisode(feedHash, decodedGuid, originalUrl, apiKey, model);
    processingLocks.set(lockKey, promise);
    
    promise.finally(() => {
      processingLocks.delete(lockKey);
      activeKeys.delete(apiKey);
    });
    
    // Return 202 Accepted immediately to indicate processing has started
    res.status(202).json({ message: 'Processing started' });
    return;
  }
  
  // If already processing, return 202
  if (processingLocks.has(lockKey)) {
    res.status(202).json({ message: 'Already processing' });
    return;
  }
});

// Get processing status
router.get('/demo/status/:feedHash/:episodeGuid', async (req: Request, res: Response) => {
  const { feedHash, episodeGuid } = req.params;
  const decodedGuid = decodeURIComponent(episodeGuid);
  
  try {
    const status = await getDemoStatus(feedHash, decodedGuid);
    res.json(status);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

export const demoRouter = router;