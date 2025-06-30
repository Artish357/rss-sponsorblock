# Demo Page Implementation Plan

## Overview
Web interface for users to test RSS SponsorBlock with their own Gemini API key.

## Architecture
- Frontend: Single HTML page with vanilla JS
- Backend: Express routes mirroring main app pattern
- Storage: Reuse existing file storage, no DB writes
- Security: API keys passed via headers, never stored

## Implementation Steps

### 1. Demo Frontend (`src/demo/public/demo.html`)
```html
<!-- Key elements -->
<input id="apiKey" type="password" placeholder="Gemini API Key">
<select id="model">
  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Free)</option>
  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Paid)</option>
</select>
<input id="feedUrl" placeholder="Podcast RSS URL">
<button onclick="loadFeed()">Load Feed</button>
<div id="episodes"></div>
```

```javascript
// Key functions
let currentProcessing = null; // Track current processing episode

async function loadFeed() {
  const feed = await fetch('/demo/feed', {
    method: 'POST',
    body: JSON.stringify({ feedUrl: feedUrl.value })
  });
  displayEpisodes(feed.episodes);
}

async function playEpisode(feedHash, episodeGuid, originalUrl) {
  // Prevent concurrent processing
  if (currentProcessing) {
    alert('Another episode is currently processing. Please wait.');
    return;
  }
  
  currentProcessing = `${feedHash}:${episodeGuid}`;
  updateUI(episodeGuid, 'processing');
  
  try {
    // Store original URL for processing
    episodeData[`${feedHash}:${episodeGuid}`] = originalUrl;
    
    // Create audio element with credentials
    const audio = new Audio();
    audio.src = `/demo/audio/${feedHash}/${episodeGuid}.mp3`;
    
    // Start polling for status
    await startPollingStatus(feedHash, episodeGuid);
    updateUI(episodeGuid, 'completed');
  } catch (error) {
    updateUI(episodeGuid, 'error', error.message);
  } finally {
    currentProcessing = null;
  }
}

async function fetchWithCredentials(url) {
  return fetch(url, {
    headers: {
      'X-Gemini-API-Key': apiKey.value,
      'X-Gemini-Model': model.value
    }
  });
}
```

### 2. Demo Controller (`src/demo/demo.controller.ts`)

```typescript
import { Router } from 'express';
import { fetchDemoFeed, processDemoEpisode, getDemoStatus } from './demo.service';

const router = Router();
const processingLocks = new Map<string, Promise<any>>();
const activeKeys = new Set<string>(); // Track active API keys

// Serve demo page
router.get('/demo', (req, res) => {
  res.sendFile('demo.html', { root: 'src/demo/public' });
});

// Fetch feed metadata
router.post('/demo/feed', async (req, res) => {
  const { feedUrl } = req.body;
  const feed = await fetchDemoFeed(feedUrl);
  res.json({
    feedHash: feed.feedHash,
    title: feed.title,
    episodes: feed.episodes.map(ep => ({
      guid: ep.guid,
      title: ep.title,
      audioUrl: ep.audioUrl // Store for processing
    }))
  });
});

// Stream audio with on-demand processing
router.get('/demo/audio/:feedHash/:episodeGuid.mp3', async (req, res) => {
  const { feedHash, episodeGuid } = req.params;
  const apiKey = req.headers['x-gemini-api-key'] as string;
  const model = req.headers['x-gemini-model'];
  const lockKey = `${feedHash}:${episodeGuid}`;
  
  // Check if already processed
  const filePath = `storage/audio/${feedHash}/processed/${episodeGuid}.mp3`;
  if (existsSync(filePath)) {
    return res.sendFile(filePath, { root: process.cwd() });
  }
  
  // Enforce one episode at a time per API key
  if (activeKeys.has(apiKey)) {
    return res.status(429).json({ 
      error: 'Another episode is already processing with this API key' 
    });
  }
  
  // Get original URL from somewhere (passed via header?)
  const originalUrl = req.headers['x-original-url'];
  
  // Process with lock
  if (!processingLocks.has(lockKey)) {
    activeKeys.add(apiKey);
    const promise = processDemoEpisode(feedHash, episodeGuid, originalUrl, apiKey, model);
    processingLocks.set(lockKey, promise);
    promise.finally(() => {
      processingLocks.delete(lockKey);
      activeKeys.delete(apiKey);
    });
  }
  
  // Wait for processing
  try {
    await processingLocks.get(lockKey);
    res.sendFile(filePath, { root: process.cwd() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get processing status
router.get('/demo/status/:feedHash/:episodeGuid', async (req, res) => {
  const { feedHash, episodeGuid } = req.params;
  const status = await getDemoStatus(feedHash, episodeGuid);
  res.json(status);
});

export const demoRouter = router;
```

### 3. Demo Service (`src/demo/demo.service.ts`)

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchFeed } from '../feed/feed.service';
import { downloadEpisode } from '../episode/download.service';
import { detectAllAdBreaks } from '../adDetection/gemini.service';
import { trimAudio } from '../trimming/trimming.service';

// In-memory status storage
const demoStatus = new Map<string, any>();

export async function fetchDemoFeed(url: string) {
  return await fetchFeed(url); // Reuse existing
}

export async function processDemoEpisode(
  feedHash: string, 
  episodeGuid: string,
  originalUrl: string,
  apiKey: string,
  model: string
) {
  const statusKey = `${feedHash}:${episodeGuid}`;
  
  try {
    // Update status
    demoStatus.set(statusKey, { status: 'downloading' });
    
    // Download
    const originalPath = await downloadEpisode(feedHash, episodeGuid, originalUrl);
    
    // Detect ads with user's credentials
    demoStatus.set(statusKey, { status: 'analyzing' });
    const genAI = new GoogleGenerativeAI(apiKey);
    // Temporarily override global client
    const segments = await detectAllAdBreaks(originalPath); // Need to pass custom client
    
    // Trim
    demoStatus.set(statusKey, { status: 'processing' });
    const processedPath = await trimAudio(originalPath, segments, feedHash, episodeGuid);
    
    // Store results
    demoStatus.set(statusKey, {
      status: 'completed',
      segments,
      processingTime: Date.now() - startTime,
      filePath: processedPath
    });
    
    return processedPath;
  } catch (error) {
    demoStatus.set(statusKey, { status: 'error', error: error.message });
    throw error;
  }
}

export async function getDemoStatus(feedHash: string, episodeGuid: string) {
  const key = `${feedHash}:${episodeGuid}`;
  return demoStatus.get(key) || { status: 'pending' };
}
```

### 4. Integration (`src/index.ts`)

```typescript
import { demoRouter } from './demo/demo.controller';
import express from 'express';

// Add before other routes
app.use(express.static('src/demo/public'));
app.use(demoRouter);
```

## TODO List

### Phase 1: Core Implementation ✅

- [x] Create demo directory structure
- [x] Implement demo.html with basic form
- [x] Create demo controller with all routes
- [x] Implement fetchDemoFeed (reuse existing)
- [x] Adapt processDemoEpisode to accept custom Gemini client
- [x] Add status tracking system

### Phase 2: Audio Handling ✅

- [x] Implement audio streaming with headers
- [x] Add processing locks
- [x] Handle original URL passing (via header)
- [x] Test on-demand processing flow

### Phase 3: Frontend Polish ✅

- [x] Add loading states
- [x] Display ad segments with timestamps
- [x] Implement audio player with controls
- [x] Add error handling and display
- [x] Show processing time (in completed badge)

### Phase 4: Refinements

- [x] Modify gemini.service.ts to accept custom client
- [ ] Add demo-specific storage path (optional)
- [ ] Clean up old demo files periodically
- [x] Add instructions for getting API key

### Recent Updates (2025-12-29)

- [x] Processing time now shown in "Completed" badge instead of separate line
- [x] Removed "(expected HH:MM:SS)" duration display
- [x] Removed "RSS listed duration" display
- [x] Process Episode button hidden for already processed episodes
- [x] Episode status checked automatically on page load and page changes
- [x] **Database Integration**: Demo now uses the main database for episode storage
- [x] **Persistent Ad Segments**: Ad detection results survive server restarts
- [x] **Improved Progress Tracking**: Progress shown as percentage based on audio position
- [x] **Async Generator**: Uses streaming ad detection for real-time updates
- [x] **No Credentials for Playback**: Processed episodes can be played without API key

## Key Technical Decisions

1. **Original URL passing**: Headers used to pass URL from frontend through audio request
2. **Gemini client injection**: Services accept optional client parameter
3. **Status storage**: Database for persistence, in-memory only for active progress
4. **Progress tracking**: Based on audio position (last ad end + 60s) / total duration
5. **Async generator**: Enables real-time segment detection updates
6. **Security**: Validate API key format, sanitize inputs
7. **Cleanup**: Consider TTL for demo files

## Open Questions

- How to pass original URL through audio request? (Header vs query param vs session)
- Should demo files use separate storage directory?
- Add rate limiting per API key?
