import { getMeteringDashboard } from '@/app/(portal)/customer/actions';
import { DataProcessingClient } from '@/components/data-processing-client';
import { requireCustomerAccess } from '@/lib/route-access';

export default async function DataProcessingPage() {
  await requireCustomerAccess();

  const initialDashboardResult = await getMeteringDashboard();

  return (
    <DataProcessingClient
      initialDashboardResult={initialDashboardResult}
      demoFunctionConfigured={Boolean(process.env.DEMO_FUNCTION_URL?.trim())}
    />
  );
}
