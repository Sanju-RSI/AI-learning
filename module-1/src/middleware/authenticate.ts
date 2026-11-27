import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import { AppError } from '../errors.js';
import { isRole } from '../modules/auth/roles.js';
import { verifyAccessToken, type AuthenticatedUser } from '../modules/auth/tokens.js';

declare global {
  // Express publishes Request through its namespace, so augmentation uses that namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function createAuthenticate(pool: Pool, secret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required.'));
      return;
    }

    let tokenUser: AuthenticatedUser;
    try {
      tokenUser = verifyAccessToken(header.slice('Bearer '.length).trim(), secret);
    } catch (error) {
      next(error);
      return;
    }

    pool
      .query<{ id: string; role: string }>('SELECT id, role FROM users WHERE id = $1', [
        tokenUser.id,
      ])
      .then((result) => {
        const row = result.rows[0];
        if (!row || !isRole(row.role)) {
          next(new AppError(401, 'UNAUTHORIZED', 'Account no longer exists.'));
          return;
        }

        req.user = { id: row.id, role: row.role };
        next();
      })
      .catch(next);
  };
}

export function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
  return req.user;
}
