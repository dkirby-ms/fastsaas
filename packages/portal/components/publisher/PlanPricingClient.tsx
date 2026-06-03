'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { PricingTable } from '@/components/publisher/PricingTable';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

interface PlanPricingClientProps {
  productId: string;
  planId: string;
}

export function PlanPricingClient({ productId, planId }: PlanPricingClientProps) {
  const pricingQuery = useQuery({
    queryKey: ['publisher-plan-pricing', productId, planId],
    queryFn: () => portalApi.getPublisherPlanPricing(productId, planId),
  });

  if (pricingQuery.isLoading) return <LoadingPanel label="Loading plan pricing" />;
  if (pricingQuery.isError) {
    if (isApiErrorStatus(pricingQuery.error, 403)) {
      return <ForbiddenState message={getErrorMessage(pricingQuery.error, 'This account does not have publisher access.')} href="/dashboard" cta="Open customer portal" />;
    }

    return <ErrorAlert message={getErrorMessage(pricingQuery.error, 'We could not load plan pricing.')} />;
  }
  if (!pricingQuery.data) return <LoadingPanel label="Loading plan pricing" />;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Pricing</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-slate-50">Plan pricing and availability</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Review billing terms, market coverage, and purchase readiness for the selected plan.</p>
      </header>

      <PricingTable pricing={pricingQuery.data} />
    </section>
  );
}
