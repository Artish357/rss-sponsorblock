# RSS SponsorBlock

Self-hosted Node.js app that removes ads from podcast episodes using multimodal AI.

## Features

- **RSS Proxy**: Replace podcast audio URLs with ad-free versions
- **Backlog Processing**: First 3 episodes process in background when feed is fetched
- **On-Demand Processing**: Older episodes process when first played, usually ready within five minutes
- **AI Ad Detection**: Uses AI to identify ad segments in audio
- **Clean Audio**: FFmpeg removes detected ads seamlessly

## Quick Start

### Option 1: Using Docker (Recommended)

1. Clone the repository
2. Copy `.env.example` to `.env` and add your Gemini API key
3. Start with Docker Compose:
   ```bash
   docker-compose up -d
   ```
4. Add the server's url in front of the original feed's. For example, `http://localhost:3000/https://original-podcast-feed.rss`
5. You've now got a copy of the feed without ads!

### Option 2: Manual Installation

1. Clone the repository
2. Copy `.env.example` to `.env` and add your Gemini API key
3. Install dependencies: `npm install`
4. Start server: `npm start`
5. Add the server's url in front of the original feed's. For example, `http://localhost:3000/https://original-podcast-feed.rss`
6. You've now got a copy of the feed without ads!

## Requirements

### Docker Installation
- Docker and Docker Compose
- Gemini API key

### Manual Installation
- Node.js 18+
- FFmpeg installed on system
- Gemini API key

## Docker Configuration

The Docker setup includes:
- Minimal multi-stage build (26 lines total)
- Alpine Linux base with FFmpeg pre-installed
- Automatic database migrations (handled by the app)
- Dynamic port configuration via environment variables
- Built-in health checks
- Volume persistence for audio files and database
- Non-root user for security
- Tini for proper signal handling
- Final image size: ~320MB (includes FFmpeg)

### Docker Commands

```bash
# Start the service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the service
docker-compose down

# Rebuild after code changes
docker-compose build
docker-compose up -d

# Access the container shell
docker-compose exec rss-sponsorblock sh
```

### Environment Variables

All environment variables from `.env` are automatically loaded. Key variables:
- `GEMINI_API_KEY` (required): Your Gemini API key
- `SERVER_PORT`: Port to expose (default: 3000)
- `STORAGE_CLEANUP_DAYS`: Days to keep processed audio (default: 30)

## License

MIT
