import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AppConfig } from '../../config.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { createAuthenticate, requireUser } from '../../middleware/authenticate.js';
import { login } from './service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function createAuthRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();

  router.post(
    '/login',
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const session = await login(pool, body.email, body.password, config.jwtSecret);
      res.json(session);
    }),
  );

  router.get(
    '/me',
    createAuthenticate(config.jwtSecret),
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const result = await pool.query<{
        id: string;
        email: string;
        full_name: string;
        role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
      }>(
        `SELECT id, email, full_name, role
         FROM users
         WHERE id = $1`,
        [actor.id],
      );
      const user = result.rows[0];
      if (!user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Account no longer exists.',
            details: {},
          },
        });
        return;
      }

      res.json({
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      });
    }),
  );

  return router;
}
