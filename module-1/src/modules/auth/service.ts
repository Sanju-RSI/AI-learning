import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { AppError } from '../../errors.js';
import type { Role } from './roles.js';
import { verifyPassword } from './passwords.js';
import { signAccessToken } from './tokens.js';

const missingAccountHash = bcrypt.hashSync('missing-account', 10);

export type PublicUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
};

export async function login(
  pool: Pool,
  email: string,
  password: string,
  jwtSecret: string,
): Promise<{ token: string; user: PublicUser }> {
  const result = await pool.query<{
    id: string;
    email: string;
    full_name: string;
    role: Role;
    password_hash: string;
  }>(
    `SELECT id, email, full_name, role, password_hash
     FROM users
     WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  const user = result.rows[0];
  const passwordMatches = await verifyPassword(password, user?.password_hash ?? missingAccountHash);

  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  return {
    token: signAccessToken({ id: user.id, role: user.role }, jwtSecret),
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
  };
}
