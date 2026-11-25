import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors.js';
import type { Role } from '../modules/auth/roles.js';

export function authorize(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication is required.'));
      return;
    }

    if (!allowed.includes(req.user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have access to this action.'));
      return;
    }

    next();
  };
}
