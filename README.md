# RSS SponsorBlock

Self-hosted Node.js app that removes ads from podcast episodes using multimodal AI.

## Features

- **RSS Proxy**: Replace podcast audio URLs with ad-free versions
- **Backlog Processing**: First 3 episodes process in background when feed is fetched
- **On-Demand Processing**: Older episodes process when first played, usually ready within five minutes
- **AI Ad Detection**: Uses AI to identify ad segments in audio
- **Clean Audio**: FFmpeg removes detected ads seamlessly

## Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` and add your Gemini API key
3. Install dependencies: `npm install`
4. Start server: `npm start`
5. Add the server's url in front of the original feed's. For example, `http://localhost:3000/https://original-podcast-feed.rss`
6. You've now got a copy of the feed without ads!

## Requirements

### Manual Installation

- Node.js 18+
- Gemini API key

## License

MIT
