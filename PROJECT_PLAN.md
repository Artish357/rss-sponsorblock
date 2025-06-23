# Podcast Ad Remover

Self-hosted Node.js app that removes ads from podcast episodes using Gemini 2.5 Flash.

## How It Works

1. **RSS Proxy**: `GET /feed?url=original-rss` → Returns RSS with local audio URLs
2. **Lazy Processing**: First audio request processes episode, subsequent requests serve cached ad-free file
3. **Ad Detection**: Gemini 2.5 Flash analyzes audio and returns ad timestamps
4. **Ad Removal**: FFmpeg cuts out ad segments and concatenates clean audio

## Architecture

```
RSS Request → Fetch Original → Replace URLs → Return Modified RSS

Audio Request → Check Cache → If Not Cached:
  → Download Audio → Gemini Analysis → FFmpeg Cut → Cache Result
  → Serve Ad-Free Audio
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
// RSS proxy
app.get('/feed', async (req, res) => {
  const feed = await rssService.fetchFeed(req.query.url);
  const modified = rssService.replaceAudioUrls(feed);
  res.type('application/rss+xml').send(modified);
});

// Audio serving with processing lock
const processingLocks = new Map();
app.get('/audio/:feedHash/:episodeGuid.mp3', async (req, res) => {
  const lockKey = `${req.params.feedHash}:${req.params.episodeGuid}`;
  
  // Check cache first
  const cached = await storageService.getEpisode(lockKey);
  if (cached) return serveAudioFile(cached.file_path, req, res);
  
  // Wait if already processing
  if (processingLocks.has(lockKey)) {
    await processingLocks.get(lockKey);
    return serveAudioFile(await storageService.getEpisode(lockKey), req, res);
  }
  
  // Process and serve
  const promise = processEpisode(lockKey, req.query.url);
  processingLocks.set(lockKey, promise);
  const result = await promise;
  processingLocks.delete(lockKey);
  
  serveAudioFile(result, req, res);
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
3. First play processes episode (2-5 min wait)
4. Subsequent plays are instant and ad-free

## Implementation Steps

1. Express server with RSS and audio routes
2. SQLite database and file storage
3. RSS parsing and URL replacement
4. Gemini 2.5 Flash integration
5. FFmpeg audio processing
6. Audio serving with range requests
7. Cleanup and error handling