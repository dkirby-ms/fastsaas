import type { ApiResponse, MeteringDashboardSummary, UsageEventIngestRequest, UsageEventIngestResponse } from '@fastsaas/shared';
import { Router, type Response } from 'express';

import type { ApiConfig } from '../../config';
import type { ApiRequest } from '../../http';
import type { MeteringService } from '../../metering/service';
import { authenticateRequest, requireScopes } from '../../middleware/auth';
import { injectTenantContext } from '../../middleware/tenant-context';

export function createMeteringRouter(config: ApiConfig, service: MeteringService) {
  const router = Router();
  const authorizeWrite = [authenticateRequest(config), injectTenantContext(config), requireScopes([config.metering.writeScope])];
  const authorizeRead = [authenticateRequest(config), injectTenantContext(config), requireScopes([config.metering.readScope])];

  /**
   * @openapi
   * /v1/metering/events:
   *   post:
   *     summary: Ingest a metering usage event
   *     tags:
   *       - Metering
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - eventId
   *               - subscriptionId
   *               - planId
   *               - dimensionId
   *               - quantity
   *               - timestamp
   *             properties:
   *               eventId:
   *                 type: string
   *               subscriptionId:
   *                 type: string
   *               planId:
   *                 type: string
   *               dimensionId:
   *                 type: string
   *               quantity:
   *                 type: number
   *               timestamp:
   *                 type: string
   *                 format: date-time
   *               idempotencyKey:
   *                 type: string
   *     responses:
   *       202:
   *         description: Usage event accepted into the outbox
   */
  router.post(
    '/events',
    ...authorizeWrite,
    async (req: ApiRequest, res: Response<ApiResponse<UsageEventIngestResponse>>) => {
      const result = await service.ingestEvent(req.context!.tenantId, req.body as UsageEventIngestRequest);

      res.status(202).json({
        status: 'success',
        data: result,
        meta: {
          requestId: req.context!.requestId,
          timestamp: new Date().toISOString(),
          version: config.apiVersion
        }
      });
    }
  );

  /**
   * @openapi
   * /v1/metering/dashboard:
   *   get:
   *     summary: Get metering submission SLA indicators for the tenant
   *     tags:
   *       - Metering
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Metering dashboard summary
   */
  router.get(
    '/dashboard',
    ...authorizeRead,
    async (req: ApiRequest, res: Response<ApiResponse<MeteringDashboardSummary>>) => {
      const summary = await service.getDashboardSummary(req.context!.tenantId);

      res.status(200).json({
        status: 'success',
        data: summary,
        meta: {
          requestId: req.context!.requestId,
          timestamp: new Date().toISOString(),
          version: config.apiVersion
        }
      });
    }
  );

  return router;
}