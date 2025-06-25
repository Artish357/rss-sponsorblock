import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  development: {
    client: 'sqlite3',
    connection: {
      filename: join(__dirname, 'storage', 'storage.db')
    },
    migrations: {
      directory: join(__dirname, 'migrations')
    },
    useNullAsDefault: true
  },

  test: {
    client: 'sqlite3',
    connection: {
      filename: join(__dirname, 'storage', 'test.db')
    },
    migrations: {
      directory: join(__dirname, 'migrations')
    },
    useNullAsDefault: true
  },

  production: {
    client: 'sqlite3',
    connection: {
      filename: join(__dirname, 'storage', 'storage.db')
    },
    migrations: {
      directory: join(__dirname, 'migrations')
    },
    useNullAsDefault: true
  }
};
