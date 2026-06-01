import { PlanClient } from '@/components/plan-client';
import { requireCustomerAccess } from '@/lib/route-access';

export default async function PlanPage() {
  await requireCustomerAccess();
  return <PlanClient />;
}
