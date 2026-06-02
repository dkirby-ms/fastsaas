import { randomUUID } from 'node:crypto';

import type { PartnerCenterAuthMode, PartnerCenterConnectionStatus } from '@fastsaas/shared';
import type { Kysely, Selectable } from 'kysely';

import type { Database } from '../db/database';
import { withDatabaseRlsContext } from '../db/execution-context';

export interface PartnerCenterAccountRecord {
  id: string;
  tenantId: string;
  pcTenantId: string;
  clientId: string;
  authMode: PartnerCenterAuthMode;
  connectionStatus: PartnerCenterConnectionStatus;
  lastValidatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerCenterCredentialRecord {
  id: string;
  accountId: string;
  secretReference: string;
  rotationMetadata?: Record<string, unknown>;
  lastRotatedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerCenterConnectionRecord {
  account: PartnerCenterAccountRecord;
  credential: PartnerCenterCredentialRecord;
}

export interface SavePartnerCenterConnectionInput {
  tenantId: string;
  pcTenantId: string;
  clientId: string;
  authMode: PartnerCenterAuthMode;
  connectionStatus: PartnerCenterConnectionStatus;
  lastValidatedAt?: string | null;
  secretReference: string;
  rotationMetadata?: Record<string, unknown>;
  lastRotatedAt?: string | null;
  expiresAt?: string | null;
}

export interface UpdatePartnerCenterConnectionStatusInput {
  tenantId: string;
  connectionStatus: PartnerCenterConnectionStatus;
  lastValidatedAt?: string | null;
}

export interface PartnerCenterRepository {
  findByTenant(tenantId: string): Promise<PartnerCenterConnectionRecord | null>;
  saveConnection(input: SavePartnerCenterConnectionInput): Promise<PartnerCenterConnectionRecord>;
  updateConnectionStatus(input: UpdatePartnerCenterConnectionStatusInput): Promise<PartnerCenterConnectionRecord>;
  deleteByTenant(tenantId: string): Promise<boolean>;
}

type PartnerCenterAccountRow = Selectable<Database['partner_center_accounts']>;
type PartnerCenterCredentialRow = Selectable<Database['partner_center_credentials']>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toIsoString(value: string | Date | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value === 'string' ? value : value.toISOString();
}

function mapAccount(row: PartnerCenterAccountRow): PartnerCenterAccountRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    pcTenantId: row.pc_tenant_id,
    clientId: row.client_id,
    authMode: row.auth_mode,
    connectionStatus: row.connection_status,
    lastValidatedAt: toIsoString(row.last_validated_at),
    createdAt: toIsoString(row.created_at) as string,
    updatedAt: toIsoString(row.updated_at) as string
  };
}

function mapCredential(row: PartnerCenterCredentialRow): PartnerCenterCredentialRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    secretReference: row.secret_reference,
    rotationMetadata: asRecord(row.rotation_metadata),
    lastRotatedAt: toIsoString(row.last_rotated_at),
    expiresAt: toIsoString(row.expires_at),
    createdAt: toIsoString(row.created_at) as string,
    updatedAt: toIsoString(row.updated_at) as string
  };
}

export class InMemoryPartnerCenterRepository implements PartnerCenterRepository {
  private readonly connections = new Map<string, PartnerCenterConnectionRecord>();

  async findByTenant(tenantId: string): Promise<PartnerCenterConnectionRecord | null> {
    return clone(this.connections.get(tenantId) ?? null);
  }

  async saveConnection(input: SavePartnerCenterConnectionInput): Promise<PartnerCenterConnectionRecord> {
    const now = new Date().toISOString();
    const existing = this.connections.get(input.tenantId);
    const account: PartnerCenterAccountRecord = {
      id: existing?.account.id ?? randomUUID(),
      tenantId: input.tenantId,
      pcTenantId: input.pcTenantId,
      clientId: input.clientId,
      authMode: input.authMode,
      connectionStatus: input.connectionStatus,
      lastValidatedAt: input.lastValidatedAt ?? undefined,
      createdAt: existing?.account.createdAt ?? now,
      updatedAt: now
    };
    const credential: PartnerCenterCredentialRecord = {
      id: existing?.credential.id ?? randomUUID(),
      accountId: account.id,
      secretReference: input.secretReference,
      rotationMetadata: input.rotationMetadata ? clone(input.rotationMetadata) : undefined,
      lastRotatedAt: input.lastRotatedAt ?? existing?.credential.lastRotatedAt ?? now,
      expiresAt: input.expiresAt ?? undefined,
      createdAt: existing?.credential.createdAt ?? now,
      updatedAt: now
    };

    const saved = { account, credential };
    this.connections.set(input.tenantId, clone(saved));
    return clone(saved);
  }

  async updateConnectionStatus(input: UpdatePartnerCenterConnectionStatusInput): Promise<PartnerCenterConnectionRecord> {
    const existing = this.connections.get(input.tenantId);
    if (!existing) {
      throw new Error(`Partner Center account for tenant ${input.tenantId} was not found`);
    }

    const updated: PartnerCenterConnectionRecord = {
      account: {
        ...clone(existing.account),
        connectionStatus: input.connectionStatus,
        lastValidatedAt: input.lastValidatedAt ?? undefined,
        updatedAt: new Date().toISOString()
      },
      credential: clone(existing.credential)
    };

    this.connections.set(input.tenantId, clone(updated));
    return clone(updated);
  }

  async deleteByTenant(tenantId: string): Promise<boolean> {
    return this.connections.delete(tenantId);
  }
}

export class KyselyPartnerCenterRepository implements PartnerCenterRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findByTenant(tenantId: string): Promise<PartnerCenterConnectionRecord | null> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const accountRow = await trx
          .selectFrom('partner_center_accounts')
          .selectAll()
          .where('tenant_id', '=', tenantId)
          .executeTakeFirst();

        if (!accountRow) {
          return null;
        }

        const credentialRow = await trx
          .selectFrom('partner_center_credentials')
          .selectAll()
          .where('account_id', '=', accountRow.id)
          .executeTakeFirst();

        if (!credentialRow) {
          return null;
        }

        return {
          account: mapAccount(accountRow),
          credential: mapCredential(credentialRow)
        };
      },
      { tenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async saveConnection(input: SavePartnerCenterConnectionInput): Promise<PartnerCenterConnectionRecord> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const now = new Date();
        const accountRow = await trx
          .insertInto('partner_center_accounts')
          .values({
            id: randomUUID(),
            tenant_id: input.tenantId,
            pc_tenant_id: input.pcTenantId,
            client_id: input.clientId,
            auth_mode: input.authMode,
            connection_status: input.connectionStatus,
            last_validated_at: input.lastValidatedAt ? new Date(input.lastValidatedAt) : null,
            created_at: now,
            updated_at: now
          })
          .onConflict((oc) =>
            oc.column('tenant_id').doUpdateSet({
              pc_tenant_id: input.pcTenantId,
              client_id: input.clientId,
              auth_mode: input.authMode,
              connection_status: input.connectionStatus,
              last_validated_at: input.lastValidatedAt ? new Date(input.lastValidatedAt) : null,
              updated_at: now
            })
          )
          .returningAll()
          .executeTakeFirstOrThrow();

        const credentialRow = await trx
          .insertInto('partner_center_credentials')
          .values({
            id: randomUUID(),
            account_id: accountRow.id,
            secret_reference: input.secretReference,
            rotation_metadata: input.rotationMetadata ?? null,
            last_rotated_at: input.lastRotatedAt ? new Date(input.lastRotatedAt) : now,
            expires_at: input.expiresAt ? new Date(input.expiresAt) : null,
            created_at: now,
            updated_at: now
          })
          .onConflict((oc) =>
            oc.column('account_id').doUpdateSet({
              secret_reference: input.secretReference,
              rotation_metadata: input.rotationMetadata ?? null,
              last_rotated_at: input.lastRotatedAt ? new Date(input.lastRotatedAt) : now,
              expires_at: input.expiresAt ? new Date(input.expiresAt) : null,
              updated_at: now
            })
          )
          .returningAll()
          .executeTakeFirstOrThrow();

        return {
          account: mapAccount(accountRow),
          credential: mapCredential(credentialRow)
        };
      },
      { tenantId: input.tenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async updateConnectionStatus(input: UpdatePartnerCenterConnectionStatusInput): Promise<PartnerCenterConnectionRecord> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const updatedAccount = await trx
          .updateTable('partner_center_accounts')
          .set({
            connection_status: input.connectionStatus,
            last_validated_at: input.lastValidatedAt ? new Date(input.lastValidatedAt) : null,
            updated_at: new Date()
          })
          .where('tenant_id', '=', input.tenantId)
          .returningAll()
          .executeTakeFirst();

        if (!updatedAccount) {
          throw new Error(`Partner Center account for tenant ${input.tenantId} was not found`);
        }

        const credentialRow = await trx
          .selectFrom('partner_center_credentials')
          .selectAll()
          .where('account_id', '=', updatedAccount.id)
          .executeTakeFirst();

        if (!credentialRow) {
          throw new Error(`Partner Center credential for tenant ${input.tenantId} was not found`);
        }

        return {
          account: mapAccount(updatedAccount),
          credential: mapCredential(credentialRow)
        };
      },
      { tenantId: input.tenantId, bypassRls: false, scope: 'tenant' }
    );
  }

  async deleteByTenant(tenantId: string): Promise<boolean> {
    return withDatabaseRlsContext(
      this.db,
      async (trx) => {
        const result = await trx.deleteFrom('partner_center_accounts').where('tenant_id', '=', tenantId).executeTakeFirst();
        return Number(result.numDeletedRows ?? 0) > 0;
      },
      { tenantId, bypassRls: false, scope: 'tenant' }
    );
  }
}
