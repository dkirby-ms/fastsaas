import { DashboardClient } from '@/components/dashboard-client';
import { requireCustomerAccess } from '@/lib/route-access';

export default async function DashboardPage() {
  await requireCustomerAccess();
  return <DashboardClient />;
}
