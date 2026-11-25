import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AppConfig } from '../../config.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { createAuthenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { roles } from '../auth/roles.js';
import { UserService } from './service.js';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(1).max(200),
  role: z.enum(roles),
  managerId: z.string().uuid().optional(),
});

export function createUserRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const users = new UserService(pool);
  router.use(createAuthenticate(config.jwtSecret));
  router.use(authorize('ADMIN'));

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json({ users: await users.list() });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const body = createUserSchema.parse(req.body);
      const user = await users.create(body);
      res.status(201).json(user);
    }),
  );

  return router;
}
