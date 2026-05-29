import type { ApiResponse } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiRequest } from '../http';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - status
 *                 - data
 *                 - meta
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [success]
 *                 data:
 *                   type: object
 *                   properties:
 *                     service:
 *                       type: string
 *                     status:
 *                       type: string
 *                 meta:
 *                   type: object
 *                   properties:
 *                     requestId:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                     version:
 *                       type: string
 */
router.get('/health', (req: ApiRequest, res: Response<ApiResponse<{ service: string; status: string }>>) => {
  res.status(200).json({
    status: 'success',
    data: {
      service: 'api',
      status: 'ok'
    },
    meta: {
      requestId: String(req.id ?? 'unknown'),
      timestamp: new Date().toISOString(),
      version: 'v1'
    }
  });
});

export { router as healthRouter };
