import knex, { Knex } from 'knex';
import knexConfig from '../../knexfile.js';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { DatabaseConfig } from './types.js';

const initDatabase = async (testMode = false): Promise<Knex> => {
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
  const db = knex(config);

  // Run migrations
  await db.migrate.latest();

  console.log(`Storage service initialized (Knex: ${config.connection.filename})`);
  return db;
};

export const db = await initDatabase();