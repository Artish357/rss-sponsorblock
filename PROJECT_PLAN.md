# Podcast Ad Remover

Self-hosted Node.js app that removes ads from podcast episodes using Gemini 2.5 Flash.

## How It Works

1. **RSS Proxy**: `GET /feed?url=original-rss` → Returns RSS with local audio URLs
2. **Pre-Processing**: First 3 episodes start processing automatically when feed is fetched
3. **Lazy Processing**: Any unprocessed episodes are processed on first play request
4. **Ad Detection**: Gemini 2.5 Flash analyzes audio and returns ad timestamps
5. **Ad Removal**: FFmpeg cuts out ad segments and concatenates clean audio

## Architecture

```
RSS Request → Fetch Original → Replace URLs → Return Modified RSS
              ↓
              → Queue first 3 episodes for background processing

Audio Request → Check Cache → If Cached: Serve immediately
                           → If Processing: Wait for completion
                           → If Not Started: Process synchronously
```

## File Structure

```
podmirror/
├── src/
│   ├── index.js              # Express server
│   ├── services/
│   │   ├── rssService.js     # RSS fetch/parse/generate
│   │   ├── geminiService.js  # Ad detection
│   │   ├── audioProcessor.js # FFmpeg processing
│   │   └── storageService.js # SQLite + file storage
│   └── prompts/
│       └── adDetection.js    # Customizable prompt
├── storage/
│   ├── audio/{feed_hash}/{episode_guid}.mp3
│   └── metadata.db
├── temp/
└── config/default.json
```

## Key Components

### Server Routes
```javascript
// RSS proxy with pre-processing
app.get('/feed', async (req, res) => {
  const feed = await rssService.fetchFeed(req.query.url);
  const modified = rssService.replaceAudioUrls(feed);
  
  // Queue first 3 episodes for sequential background processing
  (async () => {
    for (const episode of feed.episodes.slice(0, 3)) {
      try {
        await processEpisodeAsync(feed.feedHash, episode.guid, episode.audioUrl);
      } catch (error) {
        console.error(`Failed to pre-process ${episode.guid}:`, error);
      }
    }
  })();
  
  res.type('application/rss+xml').send(modified);
});

// Background processing function
const processEpisodeAsync = async (feedHash, episodeGuid, audioUrl) => {
  const lockKey = `${feedHash}:${episodeGuid}`;
  
  // Skip if already processed or processing
  const existing = await storageService.getEpisode(feedHash, episodeGuid);
  if (existing || processingLocks.has(lockKey)) return;
  
  const promise = processEpisode(feedHash, episodeGuid, audioUrl);
  processingLocks.set(lockKey, promise);
  
  try {
    await promise;
    console.log(`Pre-processed episode: ${episodeGuid}`);
  } catch (error) {
    console.error(`Pre-processing failed for ${episodeGuid}:`, error);
  } finally {
    processingLocks.delete(lockKey);
  }
};

// Audio serving with processing lock
const processingLocks = new Map();
app.get('/audio/:feedHash/:episodeGuid.mp3', async (req, res) => {
  const lockKey = `${req.params.feedHash}:${req.params.episodeGuid}`;
  
  // Check cache first
  const cached = await storageService.getEpisode(req.params.feedHash, req.params.episodeGuid);
  if (cached) return serveAudioFile(cached.file_path, req, res);
  
  // Wait if already processing (from pre-processing)
  if (processingLocks.has(lockKey)) {
    await processingLocks.get(lockKey);
    const processed = await storageService.getEpisode(req.params.feedHash, req.params.episodeGuid);
    if (processed) return serveAudioFile(processed.file_path, req, res);
  }
  
  // Process synchronously if not pre-processed
  const promise = processEpisode(req.params.feedHash, req.params.episodeGuid, req.query.url);
  processingLocks.set(lockKey, promise);
  
  try {
    const result = await promise;
    return serveAudioFile(result.file_path, req, res);
  } finally {
    processingLocks.delete(lockKey);
  }
});
```

### Ad Detection
```javascript
const detectAds = async (audioPath) => {
  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: { thinking: true, responseMimeType: "application/json" }
  });

  const audioData = await fs.readFile(audioPath);
  const result = await model.generateContent([
    { inlineData: { mimeType: 'audio/mpeg', data: audioData.toString('base64') } },
    { text: adDetectionPrompt }
  ]);

  return JSON.parse(result.response.text());
};
```

### Ad Removal
```javascript
const removeAds = async (inputPath, outputPath, adSegments) => {
  const keepSegments = buildKeepSegments(adSegments, await getAudioDuration(inputPath));
  
  const filterComplex = keepSegments
    .map((seg, i) => `[0:a]atrim=${seg.start}:${seg.end},asetpts=PTS-STARTPTS[a${i}]`)
    .join(';');
  
  const concat = keepSegments.map((_, i) => `[a${i}]`).join('') + 
    `concat=n=${keepSegments.length}:v=0:a=1[out]`;

  await execFFmpeg([
    '-i', inputPath,
    '-filter_complex', `${filterComplex};${concat}`,
    '-map', '[out]',
    '-c:a', 'libmp3lame', '-b:a', '128k',
    outputPath
  ]);
};
```

## Database Schema
```sql
CREATE TABLE episodes (
  id INTEGER PRIMARY KEY,
  feed_hash TEXT,
  episode_guid TEXT,
  original_url TEXT,
  file_path TEXT,
  ad_segments TEXT, -- JSON
  processed_at TIMESTAMP,
  UNIQUE(feed_hash, episode_guid)
);
```

## Configuration
```json
{
  "gemini": {
    "apiKey": "YOUR_KEY",
    "model": "gemini-2.5-flash",
    "timeout": 300000
  },
  "storage": {
    "audioDir": "./storage/audio",
    "cleanupAfterDays": 30
  },
  "server": {
    "port": 3000,
    "baseUrl": "http://localhost:3000"
  }
}
```


## Usage

1. Start server: `npm start`
2. Add to podcast app: `http://localhost:3000/feed?url=https://podcast.com/feed.xml`
3. Recent episodes (first 3) start processing automatically
4. Older episodes process on first play request
5. All plays after processing are instant and ad-free

## Implementation Steps

1. Express server with RSS and audio routes
2. SQLite database and file storage
3. RSS parsing and URL replacement
4. Gemini 2.5 Flash integration
5. FFmpeg audio processing
6. Audio serving with range requests
7. Cleanup and error handling