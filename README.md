# RSS SponsorBlock

Self-hosted Node.js app that removes ads from podcast episodes using Gemini AI.

## Features

- **RSS Proxy**: Replace podcast audio URLs with ad-free versions
- **Automatic Processing**: First 3 episodes process in background when feed is fetched
- **On-Demand Processing**: Older episodes process when first played
- **AI Ad Detection**: Uses Gemini to identify ad segments in audio
- **Clean Audio**: FFmpeg removes detected ads seamlessly

## Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` and add your Gemini API key
3. Install dependencies: `npm install`
4. Start server: `npm start`
5. Add to podcast app: `http://localhost:3000/feed?url=https://original-podcast-feed.xml`

## How It Works

1. When you request a podcast feed through `/feed?url=...`, the app fetches the original RSS and replaces audio URLs with local endpoints
2. The first 3 episodes start processing automatically in the background
3. When an episode is played, it either serves the cached ad-free version or processes it on-demand
4. Ad detection uses Gemini AI to analyze audio in 30-minute chunks, finding ad breaks efficiently
5. FFmpeg removes the detected ad segments and creates a clean audio file

## Configuration

Create a `.env` file with:

```
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-2.0-flash-exp
STORAGE_AUDIO_DIR=./storage/audio
SERVER_PORT=3000
SERVER_BASE_URL=http://localhost:3000
```

## Requirements

- Node.js 18+
- FFmpeg installed on system
- Gemini API key

## Testing

Run tests with: `npm test`

## License

MIT