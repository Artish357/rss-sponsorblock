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
│   └── storage.db
├── temp/
├── test-data/               # Test RSS feeds
│   ├── README.md            # Test data documentation
│   ├── conspirituality-rss.xml
│   └── behind-the-bastards-rss.xml
├── .env.example             # Environment config template
└── .env                     # Environment config (not in git)
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

## RSS Service Implementation

### RSS Fetching (`fetchFeed`)
```javascript
export const fetchFeed = async (url) => {
  // 1. Fetch RSS XML from external URL
  const response = await fetch(url);
  const xmlData = await response.text();
  
  // 2. Parse XML using xml2js
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(xmlData);
  
  // 3. Generate feed hash for storage organization
  const feedHash = crypto.createHash('md5').update(url).digest('hex');
  
  // 4. Extract episode metadata
  const episodes = result.rss.channel[0].item.map(item => ({
    title: item.title[0],
    guid: item.guid[0]._ || item.guid[0],
    audioUrl: item.enclosure[0].$.url,
    description: item.description[0],
    pubDate: item.pubDate[0]
  }));
  
  return {
    feedHash,
    title: result.rss.channel[0].title[0],
    description: result.rss.channel[0].description[0],
    episodes,
    originalXml: xmlData
  };
};
```

### URL Replacement (`replaceAudioUrls`)
```javascript
export const replaceAudioUrls = (feed) => {
  // 1. Replace original audio URLs with local proxy URLs
  // Format: /audio/{feedHash}/{episodeGuid}.mp3
  const modifiedXml = feed.originalXml.replace(
    /<enclosure[^>]+url="([^"]+)"([^>]*)>/g,
    (match, originalUrl, attributes) => {
      const episode = feed.episodes.find(ep => ep.audioUrl === originalUrl);
      if (episode) {
        const localUrl = `${process.env.SERVER_BASE_URL}/audio/${feed.feedHash}/${episode.guid}.mp3?url=${encodeURIComponent(originalUrl)}`;
        return `<enclosure url="${localUrl}"${attributes}>`;
      }
      return match;
    }
  );
  
  return modifiedXml;
};
```

### Integration Steps
1. **RSS Service**: Implement fetchFeed() and replaceAudioUrls() functions
2. **XML Parsing**: Use xml2js for robust RSS parsing
3. **Feed Hashing**: Generate MD5 hash from RSS URL for storage organization
4. **URL Proxying**: Replace audio URLs with local proxy endpoints
5. **Server Integration**: Connect RSS service to /feed route

## Database Schema
```sql
CREATE TABLE episodes (
  feed_hash TEXT NOT NULL,
  episode_guid TEXT NOT NULL,
  original_url TEXT,
  file_path TEXT,
  ad_segments TEXT, -- JSON
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (feed_hash, episode_guid)
);
```

## Configuration
Environment variables (copy `.env.example` to `.env`):
```bash
# Gemini AI Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT=300000

# Storage Configuration
STORAGE_AUDIO_DIR=./storage/audio
STORAGE_CLEANUP_DAYS=30

# Server Configuration
SERVER_PORT=3000
SERVER_BASE_URL=http://localhost:3000
```


## Usage

1. Start server: `npm start`
2. Add to podcast app: `http://localhost:3000/feed?url=https://podcast.com/feed.xml`
3. Recent episodes (first 3) start processing automatically
4. Older episodes process on first play request
5. All plays after processing are instant and ad-free

## Development Tools (MCP Servers)

### SQLite MCP Server
```bash
npx @modelcontextprotocol/server-sqlite --db-path ./storage/storage.db
```
- Query episode cache during development
- Test database schema changes
- Analyze processing statistics
- Debug cache hit/miss patterns

## Implementation Steps

1. ✅ **RSS Service**: RSS fetching and URL replacement - **COMPLETED**
   - RSS feed fetching from external URLs
   - XML parsing with xml2js
   - Feed hash generation (MD5)
   - Episode metadata extraction
   - **SECURITY FIX**: Audio URL replacement using internal IDs only (no original URLs exposed)
   - Reusable `generateAudioUrl()` function for secure URL generation
   - **IMPROVEMENT**: Replaced regex-based XML manipulation with proper xml2js parsing/building for robustness

2. ✅ **Storage Service**: In-memory episode metadata storage - **COMPLETED**
   - Episode storage with original URLs kept internal
   - Secure lookup by feedHash + episodeGuid
   - Ready for SQLite migration

3. ✅ **Test Suite**: Automated testing with Node.js test runner - **COMPLETED**
   - Security tests validating no URL exposure
   - RSS service unit tests
   - Storage service tests
   - 12 tests passing, replacing manual curl documentation

4. 🔄 **Express Server**: Basic routes implemented
   - RSS route with secure URL replacement ✅
   - Audio route with internal ID lookup ✅
   - Audio processing pipeline (TODO)

5. **Next Phase**: Gemini integration (prerequisite for audio processing)
   - SQLite database implementation:
     - Store episode metadata (feedHash, episodeGuid, originalUrl)
     - Store processing status (downloaded, analyzed, processed)
     - Store ad segments detected by Gemini
     - Store file paths (original and processed audio)
   - Gemini 2.5 Flash integration:
     - Download audio from original URL
     - Get timestamped transcript with speaker identification
     - Detect ad segments from transcript (FFmpeg-compatible timestamps)
   - Audio download service for fetching original episodes

6. **Following Phase**: Audio processing pipeline
   - FFmpeg audio processing using detected ad segments
   - Audio serving with range requests
   - Background processing queue