// Knex storage service
import knex, { type Knex } from 'knex';
import knexConfig from '../../knexfile.js';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import type { Episode, AdSegment, DatabaseConfig } from '../types/index.js';

// Database instance
let db: Knex | null = null;

// Episode data for operations (derived from main Episode interface)
type EpisodeData = Partial<Pick<Episode, 'original_url' | 'file_path' | 'ad_segments' | 'status'>>;

// Database row interface (matches SQL schema with JSON string for ad_segments)
type EpisodeRow = Omit<Episode, 'ad_segments'> & {
  ad_segments: string | null; // JSON string in database
};

// Export database close function for testing
export const closeDatabase = async (): Promise<void> => {
  if (!db) {
    return;
  }
  await db.destroy();
  db = null;
};

export const initDatabase = async (testMode = false): Promise<void> => {
  // Close existing database if any
  if (db) {
    await closeDatabase();
  }

  // Select environment based on testMode
  const environment = testMode ? 'test' : (process.env.NODE_ENV || 'development');
  const config = (knexConfig as Record<string, DatabaseConfig>)[environment];

  // Ensure the directory exists for the database file
  const dbDir = dirname(config.connection.filename);
  try {
    mkdirSync(dbDir, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create database directory: ${error instanceof Error && error.message}`);
  }

  // Initialize Knex
  db = knex(config);

  // Run migrations
  await db.migrate.latest();

  console.log(`Storage service initialized (Knex: ${config.connection.filename})`);
};

export const getEpisode = async (feedHash: string, episodeGuid: string): Promise<Episode | null> => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const episode = await db<EpisodeRow>('episodes')
    .where({ feed_hash: feedHash, episode_guid: episodeGuid })
    .first();

  if (!episode) {
    return null;
  }

  // Parse ad_segments JSON if present
  const parsedAdSegments = episode.ad_segments ? JSON.parse(episode.ad_segments) as AdSegment[] : null;

  return {
    ...episode,
    ad_segments: parsedAdSegments
  };
};

/**
 * Get all episodes for a feed
 */
export const getEpisodesByFeed = async (feedHash: string): Promise<Episode[]> => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const episodes = await db<EpisodeRow>('episodes')
    .where({ feed_hash: feedHash })
    .orderBy('processed_at', 'desc');

  // Parse ad_segments JSON for each episode
  return episodes.map(episode => ({
    ...episode,
    ad_segments: episode.ad_segments ? JSON.parse(episode.ad_segments) as AdSegment[] : null
  }));
};

/**
 * Create a new episode record (fails if already exists)
 */
export const createEpisode = async (feedHash: string, episodeGuid: string, data: EpisodeData): Promise<Episode> => {
  if (!db) {
    throw new Error('Database not initialized');
  }

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

  const result = await getEpisode(feedHash, episodeGuid);
  if (!result) {
    throw new Error('Failed to create episode');
  }
  return result;
};

/**
 * Update an existing episode record (fails if not exists)
 */
export const updateEpisode = async (feedHash: string, episodeGuid: string, data: EpisodeData): Promise<Episode> => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Check if episode exists
  const existing = await getEpisode(feedHash, episodeGuid);
  if (!existing) {
    throw new Error(`Episode not found: ${feedHash}/${episodeGuid}`);
  }

  await db('episodes')
    .where({ feed_hash: feedHash, episode_guid: episodeGuid })
    .update({
      ...data,
      processed_at: db.fn.now(),
      ad_segments: data.ad_segments !== undefined ? JSON.stringify(data.ad_segments) : undefined
    });

  const result = await getEpisode(feedHash, episodeGuid);
  if (!result) {
    throw new Error('Failed to update episode');
  }
  return result;
};

/**
 * Create or update an episode record
 */
export const createOrUpdateEpisode = async (feedHash: string, episodeGuid: string, data: EpisodeData): Promise<Episode> => {
  const existing = await getEpisode(feedHash, episodeGuid);

  if (existing) {
    return updateEpisode(feedHash, episodeGuid, data);
  } else {
    return createEpisode(feedHash, episodeGuid, data);
  }
};

/**
 * Delete a single episode
 */
export const deleteEpisode = async (feedHash: string, episodeGuid: string): Promise<boolean> => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const result = await db('episodes')
    .where({ feed_hash: feedHash, episode_guid: episodeGuid })
    .delete();

  return result > 0;
};

/**
 * Delete all episodes for a feed
 */
export const deleteEpisodesByFeed = async (feedHash: string): Promise<number> => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const result = await db('episodes')
    .where({ feed_hash: feedHash })
    .delete();

  return result;
};

/**
 * Delete episodes older than STORAGE_CLEANUP_DAYS
 */
export const deleteOldEpisodes = async (): Promise<number> => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  const cleanupDays = parseInt(process.env.STORAGE_CLEANUP_DAYS || '30', 10);

  const result = await db('episodes')
    .where('processed_at', '<', db.raw(`datetime('now', '-${cleanupDays} days')`))
    .where('status', 'processed')
    .delete();

  console.log(`Deleted ${result} episodes older than ${cleanupDays} days`);
  return result;
};