import { Pool, types } from 'pg';

const postgresDateOid = 1082;
types.setTypeParser(postgresDateOid, (value) => value);

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}
