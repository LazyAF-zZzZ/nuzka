// The supporter key, over HTTP.
//
//   GET    /api/supporter   what the key means right now. No token: the overlays read it,
//                           and it says nothing secret (the key itself is never sent back)
//   PUT    /api/supporter   { key } - check it and keep it if it works today
//   DELETE /api/supporter   forget the key; the watermark comes back
//
// Overlays also get every change as a 'supporter' socket event (server/index.ts).

import { Router } from 'express';
import { requireControl } from './auth';
import { supporterStatus, saveSupporterKey, removeSupporterKey } from '../store/supporter';
import type { KeyProblem } from '../domain/supporter';

const MESSAGES: Record<KeyProblem, string> = {
  format: 'That is not a supporter key. Copy the whole key, starting with RVS1-',
  signature: 'That key was not made by Nuzka. Check it was copied completely',
  expired: 'That key has run out',
  revoked: 'That key has been switched off'
};

export function supporterRoutes(): Router {
  const router = Router();

  router.get('/api/supporter', (_req, res) => {
    res.json(supporterStatus());
  });

  router.put('/api/supporter', requireControl, (req, res) => {
    const body = (req.body || {}) as { key?: unknown };
    const result = saveSupporterKey(body.key);
    if (!result.ok) {
      res.status(400).json({ error: MESSAGES[result.problem], code: result.problem, ...(result.status ? { status: result.status } : {}) });
      return;
    }
    res.json(result.status);
  });

  router.delete('/api/supporter', requireControl, (_req, res) => {
    res.json(removeSupporterKey());
  });

  return router;
}
