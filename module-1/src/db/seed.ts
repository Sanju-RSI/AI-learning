import bcrypt from 'bcryptjs';
import type { Pool, PoolClient } from 'pg';
import type { Role } from '../modules/auth/roles.js';

export const SEED_PASSWORD = 'Password123!';

type SeedUser = {
  email: string;
  fullName: string;
  role: Role;
  managerEmail: string | null;
};

const seedUsers: SeedUser[] = [
  {
    email: 'admin@example.com',
    fullName: 'Indira Shah',
    role: 'ADMIN',
    managerEmail: null,
  },
  {
    email: 'manager@example.com',
    fullName: 'Rohan Mehta',
    role: 'MANAGER',
    managerEmail: 'admin@example.com',
  },
  {
    email: 'employee@example.com',
    fullName: 'Asha Rao',
    role: 'EMPLOYEE',
    managerEmail: 'manager@example.com',
  },
  {
    email: 'other@example.com',
    fullName: 'Neel Kapoor',
    role: 'EMPLOYEE',
    managerEmail: 'admin@example.com',
  },
];

async function upsertUser(
  client: PoolClient,
  person: SeedUser,
  passwordHash: string,
  managerId: string | null,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, full_name, role, manager_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
     SET password_hash = EXCLUDED.password_hash,
         full_name = EXCLUDED.full_name,
         role = EXCLUDED.role,
         manager_id = EXCLUDED.manager_id
     RETURNING id`,
    [person.email, passwordHash, person.fullName, person.role, managerId],
  );

  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Seed failed for ${person.email}.`);
  }
  return id;
}

async function ensureBalance(
  client: PoolClient,
  userId: string,
  leaveType: 'ANNUAL' | 'SICK',
  year: number,
  allocatedDays: number,
): Promise<void> {
  await client.query(
    `INSERT INTO leave_balances (user_id, leave_type, year, allocated_days)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, leave_type, year) DO NOTHING`,
    [userId, leaveType, year, allocatedDays],
  );
}

export async function seed(pool: Pool): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  const thisYear = new Date().getUTCFullYear();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const ids = new Map<string, string>();

    for (const person of seedUsers) {
      const managerId = person.managerEmail ? (ids.get(person.managerEmail) ?? null) : null;
      const userId = await upsertUser(client, person, passwordHash, managerId);
      ids.set(person.email, userId);

      for (const year of [thisYear, thisYear + 1]) {
        await ensureBalance(client, userId, 'ANNUAL', year, 20);
        await ensureBalance(client, userId, 'SICK', year, 10);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
