'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

export function PlanClient() {
  const queryClient = useQueryClient();
  const plansQuery = useQuery({ queryKey: ['portal-plans'], queryFn: portalApi.getPlans });
  const updatePlanMutation = useMutation({
    mutationFn: portalApi.updatePlan,
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-plans'], data);
      queryClient.invalidateQueries({ queryKey: ['portal-dashboard'] });
    },
  });

  if (plansQuery.isLoading) return <LoadingPanel label="Loading your plan options" />;
  if (plansQuery.isError) {
    if (isApiErrorStatus(plansQuery.error, 403)) {
      return <ForbiddenState message={getErrorMessage(plansQuery.error, 'This account cannot open customer plan management.')} href="/publisher" cta="Open publisher portal" />;
    }
    return <ErrorAlert message={getErrorMessage(plansQuery.error, 'We could not load your plan options.')} />;
  }
  if (!plansQuery.data) return <LoadingPanel label="Loading your plan options" />;

  const { currentPlanId, availablePlans } = plansQuery.data;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Plan management</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">Choose the right plan for your team</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Upgrade or downgrade between curated plans now. The API client already normalizes user-friendly errors so the real backend can slot in later without changing these screens.</p>
      </header>

      {updatePlanMutation.isError ? <ErrorAlert message={getErrorMessage(updatePlanMutation.error, 'We could not update your subscription plan.')} /> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        {availablePlans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isDisabled = isCurrent || updatePlanMutation.isPending;
          return (
            <article key={plan.id} className={clsx('flex h-full flex-col rounded-3xl border bg-white dark:bg-slate-900 p-6 shadow-panel', plan.recommended ? 'border-brand-500 ring-1 ring-brand-200 dark:ring-brand-500/40' : 'border-slate-200 dark:border-slate-700')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">{plan.name}</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>
                </div>
                {plan.recommended ? <span className="rounded-full bg-brand-50 dark:bg-brand-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">Popular</span> : null}
              </div>
              <p className="mt-6 text-3xl font-semibold text-slate-950 dark:text-slate-50">{plan.priceMonthly}<span className="text-base font-medium text-slate-500 dark:text-slate-400"> / month</span></p>
              <ul className="mt-6 space-y-3 text-sm text-slate-600 dark:text-slate-400">
                {plan.features.map((feature) => (
                  <li key={feature.label} className="flex items-center gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3"><span className={clsx('h-2.5 w-2.5 rounded-full', feature.included ? 'bg-emerald-50 dark:bg-emerald-500/100' : 'bg-slate-300')} aria-hidden="true" /><span>{feature.label}</span></li>
                ))}
              </ul>
              <button type="button" disabled={isDisabled} onClick={() => updatePlanMutation.mutate(plan.id)} className={clsx('mt-8 rounded-full px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60', isCurrent ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' : 'bg-brand-600 text-white hover:bg-brand-700')}>
                {isCurrent ? 'Current plan' : updatePlanMutation.isPending ? 'Updating…' : `Switch to ${plan.name}`}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
