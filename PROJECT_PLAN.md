# RSS SponsorBlock

Self-hosted Node.js app that removes ads from podcast episodes using Gemini AI.

## How It Works

1. **RSS Proxy**: `GET /feed?url=original-rss` → Returns RSS with local audio URLs
2. **Pre-Processing**: First 3 episodes start processing automatically when feed is fetched
3. **Lazy Processing**: Any unprocessed episodes are processed on first play request
4. **Ad Detection**: Gemini AI analyzes downsampled audio chunks and returns ad timestamps
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
rss-sponsorblock/
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
├── tests/                   # Test suite
│   ├── README.md            # Testing documentation
│   ├── rssService.test.js   # RSS service tests
│   ├── security.test.js     # Security validation tests
│   └── storageService.test.js # Storage service tests
├── .env.example             # Environment config template
└── .env                     # Environment config (not in git)
```

## Key Components

### Server Routes
- **RSS Proxy** (`/feed`): Fetches RSS, replaces URLs, queues first 3 episodes for background processing
- **Audio Serving** (`/audio/:feedHash/:episodeGuid.mp3`): Serves cached audio or processes on-demand
- **Processing Locks**: Prevents duplicate processing of same episode

### Ad Detection (Iterative Chunking)
- Process audio in 30-minute chunks
- Downsample to 16kbps mono for 77% smaller files
- Detect first ad break in each chunk
- Jump 60 seconds past detected breaks
- Support for multiple time formats (SS, MM:SS, HH:MM:SS)
- Accumulate all ad breaks across entire episode

### Ad Removal
- FFmpeg-based audio processing
- Extract non-ad segments and concatenate
- Maintain audio quality with proper encoding

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
- **GEMINI_API_KEY**: Your Gemini API key
- **GEMINI_MODEL**: Model to use (default: gemini-2.5-pro)
- **STORAGE_AUDIO_DIR**: Where to store audio files
- **SERVER_PORT**: Port to run server on
- **SERVER_BASE_URL**: Base URL for audio URLs in RSS

## Usage

1. Start server: `npm start`
2. Add to podcast app: `http://localhost:3000/feed?url=https://podcast.com/feed.xml`
3. Recent episodes (first 3) start processing automatically
4. Older episodes process on first play request
5. All plays after processing are instant and ad-free

## Development Tools (MCP Servers)

### SQLite MCP Server
- Command: `npx @modelcontextprotocol/server-sqlite --db-path ./storage/storage.db`
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

2. ✅ **Storage Service**: SQLite episode metadata storage - **COMPLETED**
   - Episode storage with original URLs kept internal
   - Secure lookup by feedHash + episodeGuid
   - SQLite database with proper schema
   - JSON support for ad segments storage
   - Test/production database separation

3. ✅ **Test Suite**: Automated testing with Node.js test runner - **COMPLETED WITH NEW TESTS**
   - Security tests validating no URL exposure ✅
   - RSS service unit tests ✅ 
   - Storage service tests with SQLite ✅
   - Audio download service tests ✅
   - Audio processor tests (including downsampling) ✅
   - Audio processing service integration tests ✅
   - Gemini service unit tests ✅
   - Integration tests for service contracts ✅
   - Gemini API integration tests (with real API key) ✅
   - 49 tests passing (all tests, up from 13)

4. 🔄 **Express Server**: Basic routes implemented
   - RSS route with secure URL replacement ✅
   - Audio route with internal ID lookup ✅
   - Audio processing pipeline (TODO)

5. ✅ **Gemini Integration**: Ad detection with AI - **COMPLETED**
   - ✅ SQLite database implementation:
     - Store episode metadata (feedHash, episodeGuid, originalUrl) ✅
     - Processing status tracking (pending, downloading, analyzing, processing, processed, error) ✅
     - Ad segments storage as JSON ✅
     - File paths (original and processed audio) ✅
   - ✅ Gemini AI integration:
     - Iterative 30-minute chunk processing ✅
     - Downsampled audio (16kbps mono) for 77% smaller uploads ✅
     - Single ad break detection per chunk ✅
     - Intelligent jumping past detected breaks ✅
     - Time format handling (SS, MM:SS, HH:MM:SS) ✅
   - ✅ Audio download service using axios ✅
   - ✅ Audio processing service orchestrating the pipeline ✅
   - ✅ FFmpeg integration for chunk extraction and ad removal ✅

6. 🔄 **Current Status**: Core functionality complete
   - Express server running with all routes ✅
   - RSS proxy with secure URL replacement ✅
   - Episode pre-processing (first 3 episodes) ✅
   - On-demand processing for older episodes ✅
   - Ad detection using iterative chunking ✅
   - Ad removal with FFmpeg ✅
   - Range request support for audio serving ✅

## Recent Updates

- **Project Rename**: Renamed from `podmirror` to `rss-sponsorblock` for clarity
- **Test Organization**: Moved test documentation to `tests/README.md`
- **SQLite Integration**: Completed database implementation with proper schema
- **Gemini Integration**: Completed ad detection with iterative chunking approach
- **Performance Optimization**: Downsampled audio (16kbps mono) reduces uploads by 77%
- **Key Innovation**: Process 30-minute chunks, detect first ad break, jump ahead to continue
- **Current Status**: All core functionality implemented and working
- **Test Coverage**: Comprehensive test suite added for PR #2
  - Tests for all new services (download, processing, Gemini)
  - Tests for audio downsampling feature
  - Integration tests for full pipeline
  - Fixed inline imports as requested
