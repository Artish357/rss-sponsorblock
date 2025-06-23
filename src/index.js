import express from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// Basic RSS proxy route
app.get('/feed', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'RSS URL required' });
  }

  try {
    // TODO: Implement RSS fetching and processing
    res.status(501).json({ error: 'RSS processing not implemented yet' });
  } catch (error) {
    console.error('Error processing RSS feed:', error);
    res.status(500).json({ error: 'Failed to process RSS feed' });
  }
});

// Basic audio serving route
app.get('/audio/:feedHash/:episodeGuid.mp3', async (req, res) => {
  const { feedHash, episodeGuid } = req.params;
  
  try {
    // TODO: Implement audio processing and serving
    res.status(501).json({ error: 'Audio processing not implemented yet' });
  } catch (error) {
    console.error('Error serving audio:', error);
    res.status(500).json({ error: 'Failed to serve audio' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Podmirror server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});