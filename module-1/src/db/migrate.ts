import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool } from 'pg';

export async function migrate(pool: Pool): Promise<void> {
  const sql = readFileSync(join(process.cwd(), 'src/db/migrations/001_init.sql'), 'utf8');
  await pool.query(sql);
}
