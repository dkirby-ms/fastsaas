'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ErrorAlert } from '@/components/error-alert';
import { LoadingPanel } from '@/components/loading-panel';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';

export function CustomerSubscriptionGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const requiresSubscription = !pathname.startsWith('/publisher');
  const dashboardQuery = useQuery({
    queryKey: ['portal-dashboard'],
    queryFn: portalApi.getDashboard,
    enabled: requiresSubscription,
  });

  useEffect(() => {
    if (requiresSubscription && dashboardQuery.data?.subscription === null) {
      router.replace('/no-subscription');
    }
  }, [dashboardQuery.data?.subscription, requiresSubscription, router]);

  if (!requiresSubscription) {
    return <>{children}</>;
  }

  if (dashboardQuery.isError) {
    return <ErrorAlert message={getErrorMessage(dashboardQuery.error, 'We could not verify your subscription access.')} />;
  }

  if (dashboardQuery.isLoading || !dashboardQuery.data || dashboardQuery.data.subscription === null) {
    return <LoadingPanel label="Checking your subscription access" />;
  }

  return <>{children}</>;
}
