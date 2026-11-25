import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AppConfig } from '../../config.js';
import { asyncHandler } from '../../middleware/async-handler.js';
import { createAuthenticate, requireUser } from '../../middleware/authenticate.js';
import { todayUtc } from './dates.js';
import { LeaveService } from './service.js';
import { leaveTypes } from './types.js';

const createRequestSchema = z.object({
  leaveType: z.enum(leaveTypes),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(1).max(500),
});

const versionSchema = z.object({
  version: z.number().int().positive(),
});

const rejectSchema = versionSchema.extend({
  reason: z.string(),
});

const balanceQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  year: z.coerce.number().int().optional(),
});

export function createLeaveRouter(pool: Pool, config: AppConfig): Router {
  const router = Router();
  const leave = new LeaveService(pool);
  router.use(createAuthenticate(config.jwtSecret));

  router.get(
    '/balances',
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const query = balanceQuerySchema.parse(req.query);
      const year = query.year ?? todayUtc().getUTCFullYear();
      const balances = await leave.getBalances(actor.id, query.userId, year);
      res.json({ balances });
    }),
  );

  router.get(
    '/requests',
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const requests = await leave.listRequests(actor.id);
      res.json({ requests });
    }),
  );

  router.post(
    '/requests',
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const body = createRequestSchema.parse(req.body);
      const request = await leave.createRequest(actor.id, body, todayUtc());
      res.status(201).json(request);
    }),
  );

  router.get(
    '/requests/:id',
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const result = await leave.getRequest(actor.id, params.id);
      res.json(result);
    }),
  );

  router.post(
    '/requests/:id/approve',
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = versionSchema.parse(req.body);
      const request = await leave.decide(actor.id, params.id, 'approve', body.version, todayUtc());
      res.json(request);
    }),
  );

  router.post(
    '/requests/:id/reject',
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = rejectSchema.parse(req.body);
      const request = await leave.decide(
        actor.id,
        params.id,
        'reject',
        body.version,
        todayUtc(),
        body.reason,
      );
      res.json(request);
    }),
  );

  router.post(
    '/requests/:id/cancel',
    asyncHandler(async (req, res) => {
      const actor = requireUser(req);
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = versionSchema.parse(req.body);
      const request = await leave.decide(actor.id, params.id, 'cancel', body.version, todayUtc());
      res.json(request);
    }),
  );

  return router;
}
