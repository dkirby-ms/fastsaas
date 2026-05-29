'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ErrorAlert } from '@/components/error-alert';
import { LoadingPanel } from '@/components/loading-panel';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';

export function PlanClient() {
  const queryClient = useQueryClient();
  const plansQuery = useQuery({
    queryKey: ['portal-plans'],
    queryFn: portalApi.getPlans,
  });

  const updatePlanMutation = useMutation({
    mutationFn: portalApi.updatePlan,
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-plans'], data);
      queryClient.invalidateQueries({ queryKey: ['portal-dashboard'] });
    },
  });

  if (plansQuery.isLoading) {
    return <LoadingPanel label="Loading your plan options" />;
  }

  if (plansQuery.isError) {
    return <ErrorAlert message={getErrorMessage(plansQuery.error, 'We could not load your plan options.')} />;
  }

  if (!plansQuery.data) {
    return <LoadingPanel label="Loading your plan options" />;
  }

  const { currentPlanId, availablePlans } = plansQuery.data;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Plan management</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Choose the right plan for your team</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-500">
          Upgrade or downgrade between curated plans now. The API client already normalizes user-friendly errors so the real backend can slot in later without changing these screens.
        </p>
      </header>

      {updatePlanMutation.isError ? <ErrorAlert message={getErrorMessage(updatePlanMutation.error, 'We could not update your subscription plan.')} /> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        {availablePlans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          return (
            <article
              key={plan.id}
              className={clsx(
                'flex h-full flex-col rounded-3xl border bg-white p-6 shadow-panel',
                plan.recommended ? 'border-brand-500 ring-1 ring-brand-200' : 'border-slate-200',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950">{plan.name}</h2>
                  <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
                </div>
                {plan.recommended ? <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-700">Popular</span> : null}
              </div>
              <p className="mt-6 text-3xl font-semibold text-slate-950">
                {plan.priceMonthly}
                <span className="text-base font-medium text-slate-500"> / month</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature.label} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <span className={clsx('h-2.5 w-2.5 rounded-full', feature.included ? 'bg-emerald-500' : 'bg-slate-300')} aria-hidden="true" />
                    <span>{feature.label}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={isCurrent || updatePlanMutation.isPending}
                onClick={() => updatePlanMutation.mutate(plan.id)}
                className={clsx(
                  'mt-8 rounded-full px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                  isCurrent ? 'bg-slate-100 text-slate-500' : 'bg-brand-600 text-white hover:bg-brand-700',
                )}
              >
                {isCurrent ? 'Current plan' : updatePlanMutation.isPending ? 'Updating…' : `Switch to ${plan.name}`}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
