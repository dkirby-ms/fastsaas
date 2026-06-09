import { DataProcessingClient } from '@/components/data-processing-client';
import { requireCustomerAccess } from '@/lib/route-access';

export default async function DataProcessingPage() {
  await requireCustomerAccess();

  return (
    <DataProcessingClient
      initialDashboardResult={null}
      demoFunctionConfigured={Boolean(process.env.DEMO_FUNCTION_URL?.trim())}
    />
  );
}
