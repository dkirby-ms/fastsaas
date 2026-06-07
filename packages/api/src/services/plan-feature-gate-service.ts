import type { PlanFeatureGateRepository } from '../repositories/plan-feature-gate-repository';
import type { SubscriptionRepository } from '../repositories/subscription-repository';

export interface SetFeatureGateInput {
  featureKey: string;
  enabled: boolean;
  metadata?: unknown;
}

export interface PlanFeatureGateService {
  hasFeature(tenantId: string, featureKey: string): Promise<boolean>;
  listFeaturesForTenant(tenantId: string): Promise<string[]>;
  listFeatures(planId: string, tenantId: string): Promise<string[]>;
  setFeatureGates(tenantId: string, planId: string, gates: SetFeatureGateInput[]): Promise<void>;
  removeFeatureGate(tenantId: string, planId: string, featureKey: string): Promise<void>;
}

export class DefaultPlanFeatureGateService implements PlanFeatureGateService {
  constructor(
    private readonly featureGateRepository: PlanFeatureGateRepository,
    private readonly subscriptionRepository: SubscriptionRepository
  ) {}

  async hasFeature(tenantId: string, featureKey: string): Promise<boolean> {
    const subscriptions = await this.subscriptionRepository.listByTenant(tenantId);
    const active = subscriptions.find((sub) => sub.status === 'Active');
    if (!active) {
      return false;
    }

    const gate = await this.featureGateRepository.findEnabledByPlanAndKey(active.planId, featureKey);
    return gate !== null;
  }

  async listFeaturesForTenant(tenantId: string): Promise<string[]> {
    const subscriptions = await this.subscriptionRepository.listByTenant(tenantId);
    const active = subscriptions.find((sub) => sub.status === 'Active');
    if (!active) {
      return [];
    }

    return this.listFeatures(active.planId, tenantId);
  }

  async listFeatures(planId: string, tenantId: string): Promise<string[]> {
    const gates = await this.featureGateRepository.listByPlan(tenantId, planId);
    return gates.filter((gate) => gate.enabled).map((gate) => gate.featureKey);
  }

  async setFeatureGates(tenantId: string, planId: string, gates: SetFeatureGateInput[]): Promise<void> {
    await this.featureGateRepository.upsertMany(
      gates.map((gate) => ({
        publisherTenantId: tenantId,
        planId,
        featureKey: gate.featureKey,
        enabled: gate.enabled,
        metadata: gate.metadata
      }))
    );
  }

  async removeFeatureGate(tenantId: string, planId: string, featureKey: string): Promise<void> {
    await this.featureGateRepository.remove(tenantId, planId, featureKey);
  }
}
