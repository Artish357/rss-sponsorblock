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
/** @type {import('sqlite3').Database | null} */
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

/**
 * Get all episodes for a feed
 * @param {string} feedHash - Feed hash
 * @returns {Promise<Array>} - Array of episodes
 */
export const getEpisodesByFeed = async (feedHash) => {
  const episodes = await new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM episodes WHERE feed_hash = ? ORDER BY processed_at DESC',
      [feedHash],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
  
  // Parse ad_segments JSON for each episode
  episodes.forEach(episode => {
    if (episode.ad_segments) {
      episode.ad_segments = JSON.parse(episode.ad_segments);
    }
  });
  
  return episodes;
};

/**
 * Create a new episode record (fails if already exists)
 * @param {string} feedHash - Feed hash
 * @param {string} episodeGuid - Episode GUID
 * @param {Object} data - Episode data
 * @returns {Promise<Object>} - Created episode
 * @throws {Error} - If episode already exists
 */
export const createEpisode = async (feedHash, episodeGuid, data) => {
  // Check if episode already exists
  const existing = await getEpisode(feedHash, episodeGuid);
  if (existing) {
    throw new Error(`Episode already exists: ${feedHash}/${episodeGuid}`);
  }
  
  const adSegmentsJson = data.ad_segments ? JSON.stringify(data.ad_segments) : null;
  
  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO episodes 
       (feed_hash, episode_guid, original_url, file_path, ad_segments, status, processed_at) 
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [feedHash, episodeGuid, data.original_url, data.file_path || null, adSegmentsJson, data.status || 'pending'],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
  
  return getEpisode(feedHash, episodeGuid);
};

/**
 * Update an existing episode record (fails if not exists)
 * @param {string} feedHash - Feed hash
 * @param {string} episodeGuid - Episode GUID
 * @param {Object} data - Episode data to update
 * @returns {Promise<Object>} - Updated episode
 * @throws {Error} - If episode doesn't exist
 */
export const updateEpisode = async (feedHash, episodeGuid, data) => {
  // Check if episode exists
  const existing = await getEpisode(feedHash, episodeGuid);
  if (!existing) {
    throw new Error(`Episode not found: ${feedHash}/${episodeGuid}`);
  }
  
  const updates = [];
  const values = [];
  
  if (data.original_url !== undefined) {
    updates.push('original_url = ?');
    values.push(data.original_url);
  }
  if (data.file_path !== undefined) {
    updates.push('file_path = ?');
    values.push(data.file_path);
  }
  if (data.ad_segments !== undefined) {
    updates.push('ad_segments = ?');
    values.push(JSON.stringify(data.ad_segments));
  }
  if (data.status !== undefined) {
    updates.push('status = ?');
    values.push(data.status);
  }
  
  if (updates.length === 0) {
    return existing; // Nothing to update
  }
  
  updates.push('processed_at = datetime(\'now\')');
  values.push(feedHash, episodeGuid);
  
  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE episodes SET ${updates.join(', ')} WHERE feed_hash = ? AND episode_guid = ?`,
      values,
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
  
  return getEpisode(feedHash, episodeGuid);
};

/**
 * Create or update an episode record
 * @param {string} feedHash - Feed hash
 * @param {string} episodeGuid - Episode GUID
 * @param {Object} data - Episode data
 * @returns {Promise<Object>} - Saved episode
 */
export const createOrUpdateEpisode = async (feedHash, episodeGuid, data) => {
  const existing = await getEpisode(feedHash, episodeGuid);
  
  if (existing) {
    return updateEpisode(feedHash, episodeGuid, data);
  } else {
    return createEpisode(feedHash, episodeGuid, data);
  }
};


/**
 * Delete a single episode
 * @param {string} feedHash - Feed hash
 * @param {string} episodeGuid - Episode GUID
 * @returns {Promise<boolean>} - True if deleted, false if not found
 */
export const deleteEpisode = async (feedHash, episodeGuid) => {
  const result = await new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM episodes WHERE feed_hash = ? AND episode_guid = ?',
      [feedHash, episodeGuid],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
  
  return result > 0;
};

/**
 * Delete all episodes for a feed
 * @param {string} feedHash - Feed hash
 * @returns {Promise<number>} - Number of deleted episodes
 */
export const deleteEpisodesByFeed = async (feedHash) => {
  const result = await new Promise((resolve, reject) => {
    db.run(
      'DELETE FROM episodes WHERE feed_hash = ?',
      [feedHash],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
  
  return result;
};

/**
 * Delete episodes older than STORAGE_CLEANUP_DAYS
 * @returns {Promise<number>} - Number of deleted episodes
 */
export const deleteOldEpisodes = async () => {
  const cleanupDays = parseInt(process.env.STORAGE_CLEANUP_DAYS || '30', 10);
  
  const result = await new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM episodes 
       WHERE processed_at < datetime('now', '-' || ? || ' days')
       AND status = 'processed'`,
      [cleanupDays],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
  
  console.log(`Deleted ${result} episodes older than ${cleanupDays} days`);
  return result;
};