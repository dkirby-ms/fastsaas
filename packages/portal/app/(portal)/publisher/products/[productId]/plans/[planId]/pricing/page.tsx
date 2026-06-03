import { PlanPricingClient } from '@/components/publisher/PlanPricingClient';

export default async function PublisherPlanPricingPage({
  params,
}: Readonly<{
  params: Promise<{ productId: string; planId: string }>;
}>) {
  const { productId, planId } = await params;
  return <PlanPricingClient productId={productId} planId={planId} />;
}
