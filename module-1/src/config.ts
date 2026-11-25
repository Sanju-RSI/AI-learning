import { existsSync, readFileSync } from 'node:fs';

export type AppConfig = {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
};

function loadEnvFile(): void {
  if (!existsSync('.env')) {
    return;
  }

  const lines = readFileSync('.env', 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadConfig(): AppConfig {
  loadEnvFile();

  const parsedPort = Number(process.env.PORT ?? 3000);
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

  return {
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/leave_management',
    jwtSecret: process.env.JWT_SECRET ?? 'dev-only-leave-secret',
    port,
  };
}
