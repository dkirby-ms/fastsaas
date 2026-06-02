import type {
  PartnerCenterAuthMode,
  PartnerCenterConnectRequest,
  PartnerCenterConnection,
  PartnerCenterConnectionStatus,
  PartnerCenterDisconnectResponse,
  PartnerCenterStatusResponse
} from '@fastsaas/shared';
import type { Logger } from 'pino';

import { AppError } from '../errors/app-error';
import type {
  PartnerCenterConnectionRecord,
  PartnerCenterRepository,
  SavePartnerCenterConnectionInput
} from '../repositories/partner-center-repository';
import { PartnerCenterAuthError, type PartnerCenterAuthProvider } from './partner-center-auth';
import type { PublisherActorContext } from './publisher-service';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toOptionalIsoString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return new Date(value).toISOString();
}

export class PartnerCenterService {
  constructor(
    private readonly repository: PartnerCenterRepository,
    private readonly authProvider: PartnerCenterAuthProvider,
    private readonly logger: Logger
  ) {}

  async connect(actor: PublisherActorContext, input: PartnerCenterConnectRequest): Promise<PartnerCenterConnection> {
    const normalized = this.normalizeInput(input);
    const now = new Date().toISOString();
    const saved = await this.repository.saveConnection({
      tenantId: actor.tenantId,
      pcTenantId: normalized.pcTenantId,
      clientId: normalized.clientId,
      authMode: normalized.authMode,
      connectionStatus: 'PENDING',
      lastValidatedAt: null,
      secretReference: normalized.secretReference,
      rotationMetadata: normalized.rotationMetadata,
      lastRotatedAt: now,
      expiresAt: normalized.expiresAt ?? null
    } satisfies SavePartnerCenterConnectionInput);

    this.authProvider.invalidate(saved.account.id);

    try {
      await this.authProvider.validateConnection(saved.account, saved.credential);
      const updated = await this.repository.updateConnectionStatus({
        tenantId: actor.tenantId,
        connectionStatus: 'CONNECTED',
        lastValidatedAt: now
      });

      this.logger.info(
        { actorTenantId: actor.tenantId, requestId: actor.requestId, partnerCenterTenantId: updated.account.pcTenantId },
        'Partner Center connection validated'
      );

      return this.mapConnection(updated);
    } catch (error) {
      const failureStatus = this.resolveConnectionStatus(saved.credential.expiresAt, 'FAILED');
      await this.repository.updateConnectionStatus({
        tenantId: actor.tenantId,
        connectionStatus: failureStatus,
        lastValidatedAt: null
      });

      this.logger.warn(
        {
          actorTenantId: actor.tenantId,
          requestId: actor.requestId,
          partnerCenterTenantId: saved.account.pcTenantId,
          err: error
        },
        'Partner Center connection validation failed'
      );

      throw this.toAppError(error);
    }
  }

  async getStatus(tenantId: string): Promise<PartnerCenterStatusResponse> {
    const current = await this.repository.findByTenant(tenantId);
    if (!current) {
      return { connected: false };
    }

    const nextStatus = this.resolveConnectionStatus(current.credential.expiresAt, current.account.connectionStatus);
    const resolved =
      nextStatus === current.account.connectionStatus
        ? current
        : await this.repository.updateConnectionStatus({
            tenantId,
            connectionStatus: nextStatus,
            lastValidatedAt: current.account.lastValidatedAt ?? null
          });

    return {
      connected: resolved.account.connectionStatus === 'CONNECTED',
      connection: this.mapConnection(resolved)
    };
  }

  async disconnect(actor: PublisherActorContext): Promise<PartnerCenterDisconnectResponse> {
    const existing = await this.repository.findByTenant(actor.tenantId);
    const disconnected = await this.repository.deleteByTenant(actor.tenantId);

    if (existing) {
      this.authProvider.invalidate(existing.account.id);
    }

    if (disconnected) {
      this.logger.info({ actorTenantId: actor.tenantId, requestId: actor.requestId }, 'Partner Center connection removed');
    }

    return { disconnected };
  }

  private normalizeInput(input: PartnerCenterConnectRequest): PartnerCenterConnectRequest {
    const pcTenantId = input.pcTenantId?.trim();
    const clientId = input.clientId?.trim();
    const secretReference = input.secretReference?.trim();

    if (!pcTenantId) {
      throw AppError.badRequest('pcTenantId is required');
    }

    if (!clientId) {
      throw AppError.badRequest('clientId is required');
    }

    if (!secretReference) {
      throw AppError.badRequest('secretReference is required');
    }

    if (!this.isAuthMode(input.authMode)) {
      throw AppError.badRequest('authMode must be CLIENT_SECRET or CLIENT_CERTIFICATE');
    }

    if (input.rotationMetadata !== undefined && !isRecord(input.rotationMetadata)) {
      throw AppError.badRequest('rotationMetadata must be a JSON object when provided');
    }

    if (input.expiresAt !== undefined) {
      const expiresAt = new Date(input.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        throw AppError.badRequest('expiresAt must be a valid ISO timestamp when provided');
      }

      if (expiresAt.getTime() <= Date.now()) {
        throw AppError.badRequest('expiresAt must be in the future');
      }
    }

    return {
      pcTenantId,
      clientId,
      authMode: input.authMode,
      secretReference,
      rotationMetadata: input.rotationMetadata,
      expiresAt: input.expiresAt
    };
  }

  private mapConnection(record: PartnerCenterConnectionRecord): PartnerCenterConnection {
    return {
      id: record.account.id,
      pcTenantId: record.account.pcTenantId,
      clientId: record.account.clientId,
      authMode: record.account.authMode,
      connectionStatus: record.account.connectionStatus,
      lastValidatedAt: toOptionalIsoString(record.account.lastValidatedAt),
      credentialId: record.credential.id,
      rotationMetadata: record.credential.rotationMetadata,
      lastRotatedAt: toOptionalIsoString(record.credential.lastRotatedAt),
      expiresAt: toOptionalIsoString(record.credential.expiresAt),
      createdAt: record.account.createdAt,
      updatedAt: record.account.updatedAt
    };
  }

  private resolveConnectionStatus(
    expiresAt: string | undefined,
    fallbackStatus: PartnerCenterConnectionStatus
  ): PartnerCenterConnectionStatus {
    if (!expiresAt) {
      return fallbackStatus;
    }

    return new Date(expiresAt).getTime() <= Date.now() ? 'EXPIRED' : fallbackStatus;
  }

  private isAuthMode(value: string): value is PartnerCenterAuthMode {
    return value === 'CLIENT_SECRET' || value === 'CLIENT_CERTIFICATE';
  }

  private toAppError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof PartnerCenterAuthError) {
      if (error.statusCode >= 500) {
        return AppError.serviceUnavailable('Partner Center validation is temporarily unavailable');
      }

      return AppError.badRequest('Partner Center credentials could not be validated');
    }

    return AppError.serviceUnavailable('Partner Center validation is temporarily unavailable');
  }
}
