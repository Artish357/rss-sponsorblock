import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use STORAGE_DIR environment variable or default to ./storage
const storageDir = process.env.STORAGE_DIR || join(__dirname, 'storage');

export default {
  development: {
    client: 'sqlite3',
    connection: {
      filename: join(storageDir, 'storage.db')
    },
    migrations: {
      directory: join(__dirname, 'migrations')
    },
    useNullAsDefault: true
  },

  test: {
    client: 'sqlite3',
    connection: {
      filename: join(storageDir, 'test.db')
    },
    migrations: {
      directory: join(__dirname, 'migrations')
    },
    useNullAsDefault: true
  },

  production: {
    client: 'sqlite3',
    connection: {
      filename: join(storageDir, 'storage.db')
    },
    migrations: {
      directory: join(__dirname, 'migrations')
    },
    useNullAsDefault: true
  }
};
