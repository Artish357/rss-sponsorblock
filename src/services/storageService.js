// Knex storage service
import knex from 'knex';
import knexConfig from '../../knexfile.js';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

// Database instance
/** @type {import('knex').Knex | null} */
let db = null;

// Export database close function for testing
export const closeDatabase = async () => {
  if (!db) return;
  await db.destroy();
  db = null;
};

export const initDatabase = async (testMode = false) => {
  // Close existing database if any
  if (db) {
    await closeDatabase();
  }
  
  // Select environment based on testMode
  const environment = testMode ? 'test' : (process.env.NODE_ENV || 'development');
  const config = knexConfig[environment];
  
  // Ensure the directory exists for the database file
  const dbDir = dirname(config.connection.filename);
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch (error) {
    // Only throw if it's not an "already exists" error
    if (error.code !== 'EEXIST') {
      throw new Error(`Failed to create database directory: ${error.message}`);
    }
  }
  
  // Initialize Knex
  db = knex(config);
  
  // Run migrations
  await db.migrate.latest();
  
  console.log(`Storage service initialized (Knex: ${config.connection.filename})`);
};

export const getEpisode = async (feedHash, episodeGuid) => {
  const episode = await db('episodes')
    .where({ feed_hash: feedHash, episode_guid: episodeGuid })
    .first();
  
  if (!episode) return null;
  
  // Parse ad_segments JSON if present
  if (episode.ad_segments) {
    episode.ad_segments = JSON.parse(episode.ad_segments);
  }
  
  return episode;
};

/**
 * Get all episodes for a feed
 * @param {string} feedHash - Feed hash
 * @returns {Promise<Array>} - Array of episodes
 */
export const getEpisodesByFeed = async (feedHash) => {
  const episodes = await db('episodes')
    .where({ feed_hash: feedHash })
    .orderBy('processed_at', 'desc');
  
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
  
  await db('episodes').insert({
    feed_hash: feedHash,
    episode_guid: episodeGuid,
    original_url: data.original_url,
    file_path: data.file_path || null,
    ad_segments: adSegmentsJson,
    status: data.status || 'pending',
    processed_at: db.fn.now()
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
  
  const updates = {
    processed_at: db.fn.now(),
    original_url: data.original_url,
    file_path: data.file_path,
    ad_segments: data.ad_segments !== undefined ? JSON.stringify(data.ad_segments) : undefined,
    status: data.status
  };
  
  await db('episodes')
    .where({ feed_hash: feedHash, episode_guid: episodeGuid })
    .update(updates);
  
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
  const result = await db('episodes')
    .where({ feed_hash: feedHash, episode_guid: episodeGuid })
    .delete();
  
  return result > 0;
};

/**
 * Delete all episodes for a feed
 * @param {string} feedHash - Feed hash
 * @returns {Promise<number>} - Number of deleted episodes
 */
export const deleteEpisodesByFeed = async (feedHash) => {
  const result = await db('episodes')
    .where({ feed_hash: feedHash })
    .delete();
  
  return result;
};

/**
 * Delete episodes older than STORAGE_CLEANUP_DAYS
 * @returns {Promise<number>} - Number of deleted episodes
 */
export const deleteOldEpisodes = async () => {
  const cleanupDays = parseInt(process.env.STORAGE_CLEANUP_DAYS || '30', 10);
  
  const result = await db('episodes')
    .where('processed_at', '<', db.raw(`datetime('now', '-${cleanupDays} days')`))
    .where('status', 'processed')
    .delete();
  
  console.log(`Deleted ${result} episodes older than ${cleanupDays} days`);
  return result;
};