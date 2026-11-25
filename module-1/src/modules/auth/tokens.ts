import jwt from 'jsonwebtoken';
import { AppError } from '../../errors.js';
import { isRole, type Role } from './roles.js';

export type AuthenticatedUser = {
  id: string;
  role: Role;
};

export function signAccessToken(user: AuthenticatedUser, secret: string): string {
  return jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '12h' });
}

export function verifyAccessToken(token: string, secret: string): AuthenticatedUser {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || !isRole(decoded.role)) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid access token.');
    }

    return { id: decoded.sub, role: decoded.role };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid access token.');
  }
}
