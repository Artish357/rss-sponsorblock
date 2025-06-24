// SQLite storage service
import sqlite3 from 'sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

// Get absolute path to project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

// Create storage directory if it doesn't exist
const storageDir = path.join(projectRoot, 'storage');
try {
  mkdirSync(storageDir, { recursive: true });
} catch (error) {
  // Directory already exists
}

// Database instance
let db = null;

// Export database close function for testing
export const closeDatabase = () => {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else {
        db = null;
        resolve();
      }
    });
  });
};

export const initDatabase = async (testMode = false) => {
  // Close existing database if any
  if (db) {
    await closeDatabase();
  }
  
  // Use test database path if in test mode
  const dbName = testMode ? 'test.db' : 'storage.db';
  const dbPath = path.join(storageDir, dbName);
  
  // Initialize database
  db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      console.error('Error opening database:', err);
    }
  });
  
  // Create episodes table
  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS episodes (
        feed_hash TEXT NOT NULL,
        episode_guid TEXT NOT NULL,
        original_url TEXT,
        file_path TEXT,
        ad_segments TEXT, -- JSON
        status TEXT DEFAULT 'pending',
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (feed_hash, episode_guid)
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  
  // Add status column if it doesn't exist (for existing databases)
  await new Promise((resolve, reject) => {
    db.run(`
      ALTER TABLE episodes ADD COLUMN status TEXT DEFAULT 'pending'
    `, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
  
  console.log(`Storage service initialized (SQLite: ${dbPath})`);
};

export const getEpisode = async (feedHash, episodeGuid) => {
  const episode = await new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM episodes WHERE feed_hash = ? AND episode_guid = ?',
      [feedHash, episodeGuid],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
  
  if (!episode) return null;
  
  // Parse ad_segments JSON if present
  episode.ad_segments &&= JSON.parse(episode.ad_segments);
  
  return episode;
};

export const saveEpisode = async (feedHash, episodeGuid, data) => {
  const adSegmentsJson = data.ad_segments ? JSON.stringify(data.ad_segments) : null;
  
  await new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO episodes 
       (feed_hash, episode_guid, original_url, file_path, ad_segments, status, processed_at) 
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [feedHash, episodeGuid, data.original_url, data.file_path || null, adSegmentsJson, data.status || 'pending'],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
  
  // Return the saved episode
  return getEpisode(feedHash, episodeGuid);
};

/**
 * Update episode status
 * @param {string} feedHash - Feed hash
 * @param {string} episodeGuid - Episode GUID
 * @param {string} status - New status
 * @returns {Promise<void>}
 */
export const updateEpisodeStatus = async (feedHash, episodeGuid, status) => {
  // First try to update
  const result = await new Promise((resolve, reject) => {
    db.run(
      `UPDATE episodes SET status = ? WHERE feed_hash = ? AND episode_guid = ?`,
      [status, feedHash, episodeGuid],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
  
  // If no rows were updated, insert a new record
  if (result === 0) {
    await saveEpisode(feedHash, episodeGuid, { status });
  }
};