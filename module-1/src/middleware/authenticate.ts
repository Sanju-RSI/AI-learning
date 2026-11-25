import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';
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

export function createAuthenticate(secret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required.'));
      return;
    }

    try {
      req.user = verifyAccessToken(header.slice('Bearer '.length).trim(), secret);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
  return req.user;
}
