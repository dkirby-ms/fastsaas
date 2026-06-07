import { FeatureGate } from '@/components/feature-gate';
import { WebhooksClient } from '@/components/webhooks-client';
import { requireCustomerAccess } from '@/lib/route-access';

export default async function WebhooksPage() {
  await requireCustomerAccess();
  return (
    <FeatureGate feature="custom-webhooks">
      <WebhooksClient />
    </FeatureGate>
  );
}
