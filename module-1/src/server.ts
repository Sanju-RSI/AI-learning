import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { migrate } from './db/migrate.js';
import { createPool } from './db/pool.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  await migrate(pool);

  const app = createApp(pool, config);
  app.listen(config.port, () => {
    console.log(`Leave API listening on ${config.port}`);
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
