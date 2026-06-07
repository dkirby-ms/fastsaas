import { AnalyticsClient } from '@/components/analytics-client';
import { FeatureGate } from '@/components/feature-gate';
import { requireCustomerAccess } from '@/lib/route-access';

export default async function AnalyticsPage() {
  await requireCustomerAccess();
  return (
    <FeatureGate feature="advanced-analytics">
      <AnalyticsClient />
    </FeatureGate>
  );
}
