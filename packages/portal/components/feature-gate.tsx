'use client';

import { useHasFeature } from '@/components/features-provider';
import { UpgradePrompt } from '@/components/upgrade-prompt';

interface FeatureGateProps {
  /** Feature key to check against the customer's enabled features. */
  feature: string;
  /** Content to render when the feature is enabled. */
  children: React.ReactNode;
  /** Optional custom description for the upgrade prompt shown when the feature is locked. */
  upgradeDescription?: string;
}

/**
 * Renders `children` when the given feature is enabled for the current customer.
 * Falls back to `<UpgradePrompt>` when the feature is not part of their plan.
 */
export function FeatureGate({ feature, children, upgradeDescription }: FeatureGateProps) {
  const enabled = useHasFeature(feature);

  if (enabled) {
    return <>{children}</>;
  }

  return <UpgradePrompt feature={feature} description={upgradeDescription} />;
}
