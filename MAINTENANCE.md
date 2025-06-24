# Maintenance & Project Structure

## Project Overview

RSS SponsorBlock is a Node.js application that acts as a proxy for podcast RSS feeds, automatically detecting and removing advertisements from podcast episodes using Gemini AI.

## Directory Structure

```
rss-sponsorblock/
├── src/
│   ├── index.js                        # Main application entry point
│   ├── prompts/
│   │   └── adDetection.js              # AI prompts for ad detection
│   └── services/
│       ├── audioDownloadService.js     # Audio file downloading
│       ├── audioProcessingService.js   # Audio processing orchestration
│       ├── audioProcessor.js           # Audio manipulation utilities
│       ├── geminiService.js            # Gemini AI integration
│       ├── rssService.js               # RSS feed parsing and manipulation
│       └── storageService.js           # Database and file storage management
├── tests/
│   ├── *.test.js                       # Test files for each service
│   ├── README.md                       # Testing documentation
│   └── mocks/
│       ├── mockServices.js             # Mock implementations
│       └── testHelpers.js              # Test utilities
├── storage/
│   ├── audio/                          # Processed audio files (organized by feed)
│   └── storage.db                      # SQLite database for tracking
├── temp/                               # Temporary processing files
├── .env                                # Environment configuration
├── .env.example                        # Example environment template
└── server.log                          # Application logs
```

## Key Components

### Main Application (`src/index.js`)

- Express server setup
- Route registration for /feed and /audio endpoints
- Error handling middleware
- Graceful shutdown handling

### RSS Service (`src/services/rssService.js`)

- Fetches original RSS feeds
- Parses XML using fast-xml-parser
- Modifies audio URLs to point to local proxy endpoints
- Triggers background processing for recent episodes

### Audio Processing Service (`src/services/audioProcessingService.js`)

- Orchestrates the complete ad removal pipeline
- Manages download → detect → remove workflow
- Handles both background and on-demand processing
- Coordinates with other services for processing

### Audio Processor (`src/services/audioProcessor.js`)

- FFmpeg integration for audio manipulation
- Removes ad segments from audio files
- Implements audio downsampling for faster AI processing

### Gemini Service (`src/services/geminiService.js`)

- Integrates with Google's Gemini AI
- Processes audio in 30-minute chunks
- Uses iterative prompting for accurate ad detection
- Returns timestamped ad segments
- Utilizes prompts from `prompts/adDetection.js`

### Storage Service (`src/services/storageService.js`)

- Manages SQLite database for episode tracking
- Handles file storage organization
- Tracks processing status and metadata
- Manages audio file paths and retrieval

### Audio Download Service (`src/services/audioDownloadService.js`)

- Downloads podcast audio files
- Handles various audio formats
- Manages download retries and error handling

## Processing Flow

1. **Feed Request**: Client requests `/feed?url=...`
2. **Feed Proxy**: Server fetches original RSS, modifies audio URLs
3. **Background Processing**: First 3 episodes start processing automatically
4. **Audio Request**: When client plays episode via `/audio/:filename`
5. **On-Demand Processing**: If not cached, episode processes in real-time
6. **Ad Detection**: Gemini analyzes downsampled audio in chunks
7. **Ad Removal**: FFmpeg creates clean audio file
8. **Delivery**: Clean audio streams to client

## Configuration

### Environment Variables (.env)

- `GEMINI_API_KEY`: Required for AI ad detection
- `GEMINI_MODEL`: AI model selection (default: gemini-2.5-flash)
- `GEMINI_TIMEOUT`: Gemini API timeout in ms (default: 300000)
- `STORAGE_AUDIO_DIR`: Where processed files are stored (default: ./storage/audio)
- `STORAGE_CLEANUP_DAYS`: Days to keep processed files (default: 30)
- `SERVER_PORT`: Application port (default: 3000)
- `SERVER_BASE_URL`: Public URL for audio endpoints

### Performance Tuning

- Audio downsampling: 8kHz mono for 77% faster Gemini processing
- Chunk size: 30 minutes balances accuracy and API limits
- Concurrent processing: Limited to prevent resource exhaustion

### Data Storage

- **SQLite Database**: Tracks episode metadata, processing status, and file paths
- **File Storage**: Organized by feed ID with original and processed versions
- **Temp Directory**: Used for intermediate processing files

## Common Maintenance Tasks

### Adding New Features

1. Follow existing patterns in `src/services/`
2. Add corresponding tests in `tests/`
3. Update error handling in relevant routes
4. Document API changes if applicable

### Debugging Issues

- Check logs for error details
- Audio processing logs include timestamps
- Gemini responses logged for ad detection debugging
- Use `node -e` for testing individual functions

### Performance Optimization

- Monitor Gemini API usage and costs
- Consider caching ad detection results
- Optimize chunk sizes based on podcast types
- Review audio storage periodically
- Database cleanup for old episodes

## Testing

### Unit Tests

- Located in `tests/` directory
- Mock external dependencies (Gemini, FFmpeg)
- Focus on service logic and edge cases
- Test files: `*.test.js` for each service

### Integration Tests

- Test full processing pipeline (`integration.test.js`)
- Verify RSS feed modifications
- Check audio file handling
- Security tests (`security.test.js`)
- Gemini integration tests (`geminiService.integration.test.js`)

### Manual Testing

```bash
# Test feed parsing
curl "http://localhost:3000/feed?url=https://example.com/podcast.rss"

# Test audio processing
curl "http://localhost:3000/audio/episode-123.mp3"

# Check processing status
tail -f server.log

# Test individual functions
node -e '(async () => { const mod = await import("./src/services/geminiService.js"); console.log(mod.functionName(args)); })();'
```

## Deployment Considerations

1. **Storage**: Ensure adequate disk space for audio files
2. **Memory**: Node.js process needs ~512MB minimum
3. **API Limits**: Monitor Gemini API quotas
4. **Security**: Keep API keys secure, validate input URLs
5. **Backup**: Consider backing up processed audio files

## Current Status

- ✅ SQLite database implemented for episode tracking
- ✅ Audio downsampling for 77% faster processing
- ✅ Comprehensive test coverage
- ✅ Security tests for input validation

## Future Improvements

- Web UI for monitoring and management
- Support for video podcasts
- Multiple AI provider support
- Distributed processing for scale
- Automatic cleanup of old processed files
