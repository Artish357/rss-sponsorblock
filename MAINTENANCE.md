# Maintenance & Project Structure

## Project Overview

RSS SponsorBlock is a Node.js application that acts as a proxy for podcast RSS feeds, automatically detecting and removing advertisements from podcast episodes using Gemini AI.

## Directory Structure

```
rss-sponsorblock/
├── src/
│   ├── server.js              # Express server setup and main routes
│   ├── services/
│   │   ├── feed.js            # RSS feed parsing and manipulation
│   │   ├── process.js         # Audio processing orchestration
│   │   ├── download.js        # Audio file downloading
│   │   ├── gemini.js          # Gemini AI integration for ad detection
│   │   └── ffmpeg.js          # FFmpeg audio manipulation
│   ├── routes/
│   │   ├── feed.js            # /feed endpoint for RSS proxy
│   │   └── audio.js           # /audio/:filename endpoint
│   └── utils/
│       ├── logger.js          # Logging utilities
│       └── cache.js           # In-memory caching for feeds
├── tests/                     # Test files mirroring src structure
├── storage/
│   └── audio/                 # Processed audio files storage
├── docs/                      # Additional documentation
└── scripts/                   # Utility scripts
```

## Key Components

### Server (`src/server.js`)
- Express app configuration
- Route registration
- Error handling middleware
- Graceful shutdown handling

### Feed Service (`src/services/feed.js`)
- Fetches original RSS feeds
- Parses XML using fast-xml-parser
- Modifies audio URLs to point to local proxy
- Triggers background processing for recent episodes

### Process Service (`src/services/process.js`)
- Orchestrates the ad removal pipeline
- Manages download → detect → remove workflow
- Handles both background and on-demand processing
- Implements audio downsampling for faster AI processing

### Gemini Service (`src/services/gemini.js`)
- Integrates with Google's Gemini AI
- Processes audio in 30-minute chunks
- Uses iterative prompting for accurate ad detection
- Returns timestamped ad segments

### FFmpeg Service (`src/services/ffmpeg.js`)
- Removes ad segments from audio files
- Handles audio format conversions
- Implements efficient segment filtering

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
- `GEMINI_MODEL`: AI model selection (default: gemini-2.0-flash-exp)
- `STORAGE_AUDIO_DIR`: Where processed files are stored
- `SERVER_PORT`: Application port (default: 3000)
- `SERVER_BASE_URL`: Public URL for audio endpoints

### Performance Tuning
- Audio downsampling: 8kHz mono for 77% faster Gemini processing
- Chunk size: 30 minutes balances accuracy and API limits
- Concurrent processing: Limited to prevent resource exhaustion

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

## Testing

### Unit Tests
- Located in `tests/` directory
- Mock external dependencies (Gemini, FFmpeg)
- Focus on service logic and edge cases

### Integration Tests
- Test full processing pipeline
- Verify RSS feed modifications
- Check audio file handling

### Manual Testing
```bash
# Test feed parsing
curl "http://localhost:3000/feed?url=https://example.com/podcast.rss"

# Test audio processing
curl "http://localhost:3000/audio/episode-123.mp3"

# Check processing status
tail -f server.log
```

## Deployment Considerations

1. **Storage**: Ensure adequate disk space for audio files
2. **Memory**: Node.js process needs ~512MB minimum
3. **API Limits**: Monitor Gemini API quotas
4. **Security**: Keep API keys secure, validate input URLs
5. **Backup**: Consider backing up processed audio files

## Future Improvements

- Database for tracking processed episodes
- Web UI for monitoring and management
- Support for video podcasts
- Multiple AI provider support
- Distributed processing for scale