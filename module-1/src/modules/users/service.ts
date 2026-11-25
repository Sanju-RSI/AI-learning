import type { Pool } from 'pg';
import { AppError } from '../../errors.js';
import { hashPassword } from '../auth/passwords.js';
import type { Role } from '../auth/roles.js';

export type CreateUserInput = {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  managerId?: string;
};

type UserResponse = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  managerId: string | null;
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export class UserService {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<UserResponse[]> {
    const result = await this.pool.query<{
      id: string;
      email: string;
      full_name: string;
      role: Role;
      manager_id: string | null;
    }>(
      `SELECT id, email, full_name, role, manager_id
       FROM users
       ORDER BY full_name`,
    );

    return result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      managerId: row.manager_id,
    }));
  }

  async create(input: CreateUserInput): Promise<UserResponse> {
    if (input.role !== 'ADMIN' && !input.managerId) {
      throw new AppError(422, 'MANAGER_REQUIRED', 'Employees and managers must have a manager.');
    }

    if (input.managerId) {
      const manager = await this.pool.query('SELECT id FROM users WHERE id = $1', [
        input.managerId,
      ]);
      if (!manager.rows[0]) {
        throw new AppError(422, 'MANAGER_NOT_FOUND', 'Manager does not exist.');
      }
    }

    const passwordHash = await hashPassword(input.password);
    const year = new Date().getUTCFullYear();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{
        id: string;
        email: string;
        full_name: string;
        role: Role;
        manager_id: string | null;
      }>(
        `INSERT INTO users (email, password_hash, full_name, role, manager_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, full_name, role, manager_id`,
        [
          input.email.trim().toLowerCase(),
          passwordHash,
          input.fullName.trim(),
          input.role,
          input.managerId ?? null,
        ],
      );
      const user = inserted.rows[0];
      if (!user) {
        throw new AppError(500, 'INTERNAL_ERROR', 'User could not be saved.');
      }

      for (const balanceYear of [year, year + 1]) {
        await client.query(
          `INSERT INTO leave_balances (user_id, leave_type, year, allocated_days)
           VALUES ($1, 'ANNUAL', $2, 20), ($1, 'SICK', $2, 10)`,
          [user.id, balanceYear],
        );
      }

      await client.query('COMMIT');
      return {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        managerId: user.manager_id,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'EMAIL_IN_USE', 'A user with this email already exists.');
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
