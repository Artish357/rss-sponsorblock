import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { feedRouter } from './feed/feed.controller';
import { initDatabase } from './general/db';
import { episodeRouter } from './episode/episode.controller';

dotenv.config();

const app = express();
const HOST = process.env.SERVER_HOST || 'localhost';
const PORT = parseInt(process.env.SERVER_PORT ?? '') || 3000;

// Initialize storage service
await initDatabase();

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(episodeRouter)
app.use(feedRouter)

app.listen(PORT, HOST, () => {
  console.log(`RSS SponsorBlock server running on port ${PORT}`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
});