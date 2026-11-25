import { loadConfig } from '../config.js';
import { migrate } from './migrate.js';
import { createPool } from './pool.js';
import { seed } from './seed.js';

const pool = createPool(loadConfig().databaseUrl);

migrate(pool)
  .then(() => seed(pool))
  .then(async () => {
    await pool.end();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await pool.end();
    process.exit(1);
  });
