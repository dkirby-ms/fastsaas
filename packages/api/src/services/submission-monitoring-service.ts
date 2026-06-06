import type { Logger } from 'pino';

export interface PublisherSubmissionValidationIssue {
  level: 'error' | 'warning' | 'informational';
  message: string;
  resourceName: string;
  code?: string;
  resourceType?: string;
  fieldPath?: string;
}

export interface PublisherSubmissionResourceSummary {
  resourceKey: string;
  resourceType: string;
  resourceName: string;
  durableId: string;
  externalId?: string;
  lifecycleState?: string;
}

export interface PublisherSubmissionHistoryEntry {
  submissionId: string;
  environment: 'draft' | 'preview' | 'live';
  status: string;
  result?: string;
  createdAt?: string;
  updatedAt?: string;
  validationIssues: PublisherSubmissionValidationIssue[];
}

export interface PublisherSubmissionEnvironmentState {
  environment: 'draft' | 'preview' | 'live';
  currentSubmission?: PublisherSubmissionHistoryEntry;
  submissions: PublisherSubmissionHistoryEntry[];
  validationIssues: PublisherSubmissionValidationIssue[];
  resources: PublisherSubmissionResourceSummary[];
  lastUpdatedAt?: string;
}

export interface PublisherProductSubmissionsResponse {
  productId: string;
  externalOfferId: string;
  durableProductId: string;
  lastSyncedAt: string;
  fetchedAt: string;
  environments: {
    draft: PublisherSubmissionEnvironmentState;
    preview: PublisherSubmissionEnvironmentState;
    live: PublisherSubmissionEnvironmentState;
  };
  history: PublisherSubmissionHistoryEntry[];
}

export interface PublisherSubmissionDiffEntry {
  resourceKey: string;
  resourceType: string;
  resourceName: string;
  changeType: 'added' | 'removed' | 'modified';
  fieldPaths: string[];
  draftResource?: Record<string, unknown>;
  liveResource?: Record<string, unknown>;
}

export interface PublisherProductSubmissionDiffResponse {
  productId: string;
  externalOfferId: string;
  durableProductId: string;
  comparedAt: string;
  sourceEnvironment: 'draft';
  targetEnvironment: 'live';
  hasChanges: boolean;
  changes: PublisherSubmissionDiffEntry[];
}

import { AppError } from '../errors/app-error';
import { ProductIngestionClient, ProductIngestionError, type ProductIngestionClientLike } from '../lib/product-ingestion-client';
import {
  PRODUCT_INGESTION_SCHEMAS,
  type ProductIngestionEnvironment,
  type ProductIngestionResource,
  type ProductIngestionResourceReference,
  type ProductIngestionResourceTreeResponse,
  type SubmissionResource
} from '../lib/product-ingestion-types';
import type { ProductCatalogRepository, StoredMarketplaceResource, StoredMarketplaceSubmission } from '../repositories/product-catalog-repository';
import type { MarketplaceBearerTokenProvider } from './marketplace-oauth-service';
import type { PartnerCenterAuthProvider } from './partner-center-auth';

export interface SubmissionMonitoringServiceOptions {
  repository: ProductCatalogRepository;
  authProvider?: PartnerCenterAuthProvider;
  tokenProvider?: MarketplaceBearerTokenProvider;
  logger: Logger;
  clientFactory?: (args: { publisherTenantId: string }) => ProductIngestionClientLike;
  now?: () => Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getExternalIdentity(value: { externalId?: string; externalID?: string } | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return typeof value.externalId === 'string' && value.externalId.length > 0
    ? value.externalId
    : typeof value.externalID === 'string' && value.externalID.length > 0
      ? value.externalID
      : undefined;
}

function normalizeEnvironment(value: string | undefined): ProductIngestionEnvironment {
  return value === 'preview' || value === 'live' ? value : 'draft';
}

function getResourceType(resource: ProductIngestionResource): string {
  switch (resource.$schema) {
    case PRODUCT_INGESTION_SCHEMAS.product:
      return 'product';
    case PRODUCT_INGESTION_SCHEMAS.plan:
      return 'plan';
    case PRODUCT_INGESTION_SCHEMAS.submission:
      return 'submission';
    case PRODUCT_INGESTION_SCHEMAS.listing:
      return 'listing';
    case PRODUCT_INGESTION_SCHEMAS.property:
      return 'property';
    case PRODUCT_INGESTION_SCHEMAS.priceAndAvailabilityPlan:
      return 'priceAndAvailabilityPlan';
    case PRODUCT_INGESTION_SCHEMAS.softwareAsAServiceTechnicalConfiguration:
      return 'softwareAsAServiceTechnicalConfiguration';
    default:
      return 'unknown';
  }
}

function getResourceExternalId(resource: ProductIngestionResource): string | undefined {
  if (!('identity' in resource) || !isRecord(resource.identity)) {
    return undefined;
  }

  return getExternalIdentity(resource.identity as { externalId?: string; externalID?: string });
}

function getResourceLabel(resource: ProductIngestionResource, fallback: string): string {
  return resource.resourceName ?? resource.id ?? getResourceExternalId(resource) ?? fallback;
}

function getResourceDurableId(resource: ProductIngestionResource, index: number): string {
  return resource.id ?? resource.resourceName ?? getResourceExternalId(resource) ?? `${getResourceType(resource)}-${index}`;
}

function buildResourceSummary(resource: ProductIngestionResource, index: number): PublisherSubmissionResourceSummary {
  const durableId = getResourceDurableId(resource, index);

  return {
    resourceKey: `${getResourceType(resource)}:${durableId}`,
    resourceType: getResourceType(resource),
    resourceName: getResourceLabel(resource, durableId),
    durableId,
    externalId: getResourceExternalId(resource),
    lifecycleState: typeof resource.lifecycleState === 'string' ? resource.lifecycleState : undefined
  };
}

function getReferenceResourceName(reference: ProductIngestionResourceReference | undefined): string | undefined {
  if (!reference) {
    return undefined;
  }

  if (typeof reference === 'string') {
    return reference;
  }

  if ('resourceName' in reference && typeof reference.resourceName === 'string') {
    return reference.resourceName;
  }

  return 'externalId' in reference ? reference.externalId ?? reference.externalID : undefined;
}

function collectValidationIssues(resources: ProductIngestionResource[]): PublisherSubmissionValidationIssue[] {
  const issues: PublisherSubmissionValidationIssue[] = [];
  const seen = new Set<string>();

  const addIssue = (issue: PublisherSubmissionValidationIssue) => {
    const key = `${issue.level}:${issue.resourceName}:${issue.code ?? ''}:${issue.fieldPath ?? ''}:${issue.message}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    issues.push(issue);
  };

  const visit = (
    value: unknown,
    defaults: {
      level: PublisherSubmissionValidationIssue['level'];
      resourceName: string;
      resourceType: string;
      fieldPath?: string;
    }
  ) => {
    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry, defaults);
      }
      return;
    }

    if (!isRecord(value)) {
      return;
    }

    const message = toStringOrUndefined(value.message) ?? toStringOrUndefined(value.description);
    const code = toStringOrUndefined(value.code);
    const level =
      value.level === 'warning' || value.level === 'informational'
        ? value.level
        : defaults.level;
    const resourceName =
      getReferenceResourceName(value.resourceId as ProductIngestionResourceReference | undefined) ?? defaults.resourceName;
    const fieldPath = toStringOrUndefined(value.fieldPath) ?? defaults.fieldPath;

    if (message) {
      addIssue({
        level,
        code,
        message,
        resourceName,
        resourceType: defaults.resourceType,
        fieldPath
      });
    }

    visit(value.details, defaults);
    visit(value.errors, defaults);
    visit(value.validationErrors, defaults);
    visit(value.innerErrors, defaults);
  };

  for (const [index, resource] of resources.entries()) {
    const summary = buildResourceSummary(resource, index);
    visit(resource.validations, {
      level: 'warning',
      resourceName: summary.resourceName,
      resourceType: summary.resourceType
    });
    visit((resource as { errors?: unknown }).errors, {
      level: 'error',
      resourceName: summary.resourceName,
      resourceType: summary.resourceType
    });
    visit((resource as { validationErrors?: unknown }).validationErrors, {
      level: 'error',
      resourceName: summary.resourceName,
      resourceType: summary.resourceType
    });
  }

  return issues;
}

function isSubmissionResource(resource: ProductIngestionResource): resource is SubmissionResource {
  return resource.$schema === PRODUCT_INGESTION_SCHEMAS.submission && 'product' in resource;
}

function parseTimestamp(value: string | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

function sortHistory(entries: PublisherSubmissionHistoryEntry[]): PublisherSubmissionHistoryEntry[] {
  return [...entries].sort((left, right) => {
    const timestampDelta = parseTimestamp(right.createdAt ?? right.updatedAt) - parseTimestamp(left.createdAt ?? left.updatedAt);
    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    return right.submissionId.localeCompare(left.submissionId);
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function collectDiffPaths(left: unknown, right: unknown, prefix = ''): string[] {
  if (stableStringify(left) === stableStringify(right)) {
    return [];
  }

  if (!isRecord(left) || !isRecord(right)) {
    return [prefix || '$'];
  }

  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const paths: string[] = [];
  for (const key of [...keys].sort()) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    paths.push(...collectDiffPaths(left[key], right[key], nextPrefix));
  }

  return paths;
}

function buildHistoryEntry(
  environment: ProductIngestionEnvironment,
  submission: SubmissionResource,
  fallback: StoredMarketplaceSubmission | undefined,
  fetchedAt: string,
  validationIssues: PublisherSubmissionValidationIssue[]
): PublisherSubmissionHistoryEntry {
  const submissionId = submission.id ?? fallback?.durableSubmissionId ?? `${environment}-submission`;

  return {
    submissionId,
    environment,
    status: submission.status ?? fallback?.status ?? 'unknown',
    result: typeof submission.result === 'string' ? submission.result : typeof submission.lifecycleState === 'string' ? submission.lifecycleState : undefined,
    createdAt: submission.created ?? fallback?.createdAt,
    updatedAt: fallback?.updatedAt ?? fetchedAt,
    validationIssues
  };
}

function buildCachedHistoryEntry(environment: ProductIngestionEnvironment, submission: StoredMarketplaceSubmission): PublisherSubmissionHistoryEntry {
  return {
    submissionId: submission.durableSubmissionId,
    environment,
    status: submission.status,
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
    validationIssues: []
  };
}

function buildCachedTree(
  durableProductId: string,
  environment: ProductIngestionEnvironment,
  resources: StoredMarketplaceResource[]
): ProductIngestionResourceTreeResponse<ProductIngestionResource> {
  return {
    root: durableProductId,
    target: { targetType: environment },
    resources: resources.map((resource) => clone(resource.jsonSnapshot as ProductIngestionResource))
  };
}

export class SubmissionMonitoringService {
  private readonly clientFactory: NonNullable<SubmissionMonitoringServiceOptions['clientFactory']>;
  private readonly now: () => Date;

  constructor(private readonly options: SubmissionMonitoringServiceOptions) {
    this.clientFactory =
      options.clientFactory ??
      (({ publisherTenantId }) => {
        if (this.options.tokenProvider) {
          return new ProductIngestionClient({
            logger: this.options.logger.child({ component: 'product-ingestion-client', tenantId: publisherTenantId }),
            tokenProvider: this.options.tokenProvider
          });
        }

        if (!this.options.authProvider) {
          throw new Error('SubmissionMonitoringService requires tokenProvider or authProvider');
        }

        return new ProductIngestionClient({
          logger: this.options.logger.child({ component: 'product-ingestion-client', tenantId: publisherTenantId }),
          authProvider: this.options.authProvider
        });
      });
    this.now = options.now ?? (() => new Date());
  }

  async getProductSubmissions(publisherTenantId: string, productId: string): Promise<PublisherProductSubmissionsResponse> {
    const detail = await this.options.repository.getProductDetailById(publisherTenantId, productId);
    if (!detail) {
      throw AppError.notFound('Marketplace product was not found', { productId });
    }

    const fetchedAt = this.now().toISOString();
    const cachedResources = await this.options.repository.listResourcesByProductId(publisherTenantId, productId);
    const cachedResourcesByEnvironment = new Map<ProductIngestionEnvironment, StoredMarketplaceResource[]>();
    for (const resource of cachedResources) {
      const environment = normalizeEnvironment(resource.environment);
      const existing = cachedResourcesByEnvironment.get(environment) ?? [];
      existing.push(resource);
      cachedResourcesByEnvironment.set(environment, existing);
    }

    const client = await this.loadClient(publisherTenantId);
    const environments = await Promise.all(
      (['draft', 'preview', 'live'] as const).map(async (environment) => {
        const remoteTree = await this.getTree(client, detail.product.durableProductId, environment);
        const tree =
          remoteTree.resources.length > 0 || !cachedResourcesByEnvironment.has(environment)
            ? remoteTree
            : buildCachedTree(detail.product.durableProductId, environment, cachedResourcesByEnvironment.get(environment) ?? []);
        return [environment, tree] as const;
      })
    );

    const cachedSubmissionsByEnvironment = new Map<ProductIngestionEnvironment, StoredMarketplaceSubmission[]>();
    for (const submission of detail.submissions) {
      const environment = normalizeEnvironment(submission.targetType);
      const existing = cachedSubmissionsByEnvironment.get(environment) ?? [];
      existing.push(submission);
      cachedSubmissionsByEnvironment.set(environment, existing);
    }

    const states = Object.fromEntries(
      environments.map(([environment, tree]) => {
        const validationIssues = collectValidationIssues(tree.resources);
        const remoteSubmissions = tree.resources.filter(isSubmissionResource);
        const cachedById = new Map(
          (cachedSubmissionsByEnvironment.get(environment) ?? []).map((submission) => [submission.durableSubmissionId, submission] as const)
        );
        const submissions = remoteSubmissions.map((submission) =>
          buildHistoryEntry(environment, submission, cachedById.get(submission.id ?? ''), fetchedAt, validationIssues)
        );

        for (const cachedSubmission of cachedById.values()) {
          if (!submissions.some((submission) => submission.submissionId === cachedSubmission.durableSubmissionId)) {
            submissions.push(buildCachedHistoryEntry(environment, cachedSubmission));
          }
        }

        const sortedSubmissions = sortHistory(submissions);
        const state: PublisherSubmissionEnvironmentState = {
          environment,
          currentSubmission: sortedSubmissions[0],
          submissions: sortedSubmissions,
          validationIssues,
          resources: tree.resources.map((resource, index) => buildResourceSummary(resource, index)),
          lastUpdatedAt: sortedSubmissions[0]?.updatedAt ?? (tree.resources.length > 0 ? fetchedAt : undefined)
        };

        return [environment, state];
      })
    ) as PublisherProductSubmissionsResponse['environments'];

    return {
      productId: detail.product.id,
      externalOfferId: detail.product.externalOfferId,
      durableProductId: detail.product.durableProductId,
      lastSyncedAt: detail.product.lastSyncedAt,
      fetchedAt,
      environments: states,
      history: sortHistory([...states.draft.submissions, ...states.preview.submissions, ...states.live.submissions])
    };
  }

  async getProductDiff(publisherTenantId: string, productId: string): Promise<PublisherProductSubmissionDiffResponse> {
    const detail = await this.options.repository.getProductDetailById(publisherTenantId, productId);
    if (!detail) {
      throw AppError.notFound('Marketplace product was not found', { productId });
    }

    const client = await this.loadClient(publisherTenantId);
    const [draftTree, liveTree] = await Promise.all([
      this.getTree(client, detail.product.durableProductId, 'draft'),
      this.getTree(client, detail.product.durableProductId, 'live')
    ]);
    const comparedAt = this.now().toISOString();

    const draftResources = new Map(
      draftTree.resources
        .filter((resource) => resource.$schema !== PRODUCT_INGESTION_SCHEMAS.submission)
        .map((resource, index) => {
          const summary = buildResourceSummary(resource, index);
          return [summary.resourceKey, { summary, resource: clone(resource) }] as const;
        })
    );
    const liveResources = new Map(
      liveTree.resources
        .filter((resource) => resource.$schema !== PRODUCT_INGESTION_SCHEMAS.submission)
        .map((resource, index) => {
          const summary = buildResourceSummary(resource, index);
          return [summary.resourceKey, { summary, resource: clone(resource) }] as const;
        })
    );

    const changes: PublisherSubmissionDiffEntry[] = [];
    const keys = new Set([...draftResources.keys(), ...liveResources.keys()]);
    for (const key of [...keys].sort()) {
      const draftResource = draftResources.get(key);
      const liveResource = liveResources.get(key);

      if (draftResource && !liveResource) {
        changes.push({
          resourceKey: key,
          resourceType: draftResource.summary.resourceType,
          resourceName: draftResource.summary.resourceName,
          changeType: 'added',
          fieldPaths: ['$'],
          draftResource: draftResource.resource
        });
        continue;
      }

      if (!draftResource || !liveResource) {
        changes.push({
          resourceKey: key,
          resourceType: (liveResource ?? draftResource)!.summary.resourceType,
          resourceName: (liveResource ?? draftResource)!.summary.resourceName,
          changeType: 'removed',
          fieldPaths: ['$'],
          liveResource: liveResource?.resource
        });
        continue;
      }

      const fieldPaths = collectDiffPaths(draftResource.resource, liveResource.resource);
      if (fieldPaths.length > 0) {
        changes.push({
          resourceKey: key,
          resourceType: draftResource.summary.resourceType,
          resourceName: draftResource.summary.resourceName,
          changeType: 'modified',
          fieldPaths,
          draftResource: draftResource.resource,
          liveResource: liveResource.resource
        });
      }
    }

    return {
      productId: detail.product.id,
      externalOfferId: detail.product.externalOfferId,
      durableProductId: detail.product.durableProductId,
      comparedAt,
      sourceEnvironment: 'draft',
      targetEnvironment: 'live',
      hasChanges: changes.length > 0,
      changes
    };
  }

  private async loadClient(publisherTenantId: string): Promise<ProductIngestionClientLike> {
    if (!this.options.tokenProvider && !this.options.authProvider) {
      throw AppError.serviceUnavailable('Marketplace OAuth configuration or a Partner Center auth provider is required for submission monitoring');
    }

    return this.clientFactory({ publisherTenantId });
  }

  private async getTree(
    client: ProductIngestionClientLike,
    durableProductId: string,
    environment: ProductIngestionEnvironment
  ): Promise<ProductIngestionResourceTreeResponse<ProductIngestionResource>> {
    try {
      return await client.getResourceTree(durableProductId, environment);
    } catch (error) {
      if (error instanceof ProductIngestionError && error.statusCode === 404) {
        return {
          root: durableProductId,
          target: { targetType: environment },
          resources: []
        };
      }

      throw this.toAppError(error);
    }
  }

  private toAppError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof ProductIngestionError) {
      if (error.statusCode >= 500 || error.statusCode === 429) {
        return AppError.serviceUnavailable('Partner Center submission monitoring is temporarily unavailable');
      }

      if (error.statusCode === 404) {
        return AppError.notFound('Partner Center product was not found');
      }

      return AppError.badRequest('Unable to retrieve submission monitoring data from Partner Center');
    }

    return AppError.serviceUnavailable('Partner Center submission monitoring is temporarily unavailable');
  }
}
