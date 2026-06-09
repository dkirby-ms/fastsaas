'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { getOperatorDashboardAction } from '@/app/(portal)/operator/actions';
import { ApiError } from '@/lib/errors';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';
import type { ActionResult } from '@/app/(portal)/operator/actions';

function unwrapResult<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new ApiError(result.message, result.status, result.code);
  return result.data;
}

export function OperatorDashboardClient() {
  const dashboardQuery = useQuery({ queryKey: ['operator-dashboard'], queryFn: () => getOperatorDashboardAction().then(unwrapResult) });

  if (dashboardQuery.isLoading) return <LoadingPanel label="Loading operator metrics" />;
  if (dashboardQuery.isError) {
    if (isApiErrorStatus(dashboardQuery.error, 403)) {
      return <ForbiddenState message={getErrorMessage(dashboardQuery.error, 'This account does not have operator access.')} href="/dashboard" cta="Open customer portal" />;
    }
    return <ErrorAlert message={getErrorMessage(dashboardQuery.error, 'We could not load operator metrics.')} />;
  }
  if (!dashboardQuery.data) return <LoadingPanel label="Loading operator metrics" />;

  const dashboard = dashboardQuery.data;
  const stats = [
    { label: 'Active tenants', value: dashboard.activeTenants.toString() },
    { label: 'Churned tenants', value: dashboard.churnedTenants.toString() },
    { label: 'Total seats', value: dashboard.totalSeats.toString() },
  ];

  return (
    <section className="space-y-6">
      <header className="rounded-3xl bg-slate-950 dark:bg-slate-900 px-6 py-8 text-white shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Operator overview</p>
        <h1 className="mt-3 text-3xl font-semibold">Marketplace operations at a glance</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-300 dark:text-slate-400">Track active tenants, churn, and seat footprint from the same tenant-scoped auth session used by the API.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => <article key={stat.label} className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-panel"><p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p><p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">{stat.value}</p></article>)}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Plan mix</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Current tenant distribution across your plan catalog.</p></div><Link href="/operator/plans" className="text-sm font-semibold text-brand-700 dark:text-brand-300 hover:text-brand-800 dark:hover:text-brand-200">Manage plans</Link></div>
          <div className="mt-6 space-y-3">
            {dashboard.plans.map((plan) => <div key={plan.planId} className="flex items-center justify-between rounded-2xl bg-slate-50 dark:bg-slate-800/60 px-4 py-3"><div><p className="font-medium text-slate-950 dark:text-slate-50">{plan.planName}</p><p className="text-sm text-slate-500 dark:text-slate-400">{plan.planId}</p></div><span className="rounded-full bg-brand-50 dark:bg-brand-500/15 px-3 py-1 text-sm font-semibold text-brand-700 dark:text-brand-300">{plan.tenantCount} tenants</span></div>)}
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Next steps</h2>
          <div className="mt-6 space-y-4">
            <Link href="/operator/tenants" className="block rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-4 transition hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10"><p className="font-semibold text-slate-950 dark:text-slate-50">Review tenant statuses</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Open the tenant workspace to activate, suspend, or inspect subscriptions.</p></Link>
            <Link href="/operator/plans" className="block rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-4 transition hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-500/10"><p className="font-semibold text-slate-950 dark:text-slate-50">Tune your catalog</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Adjust plan metadata now and swap to dedicated API routes as they land.</p></Link>
          </div>
        </article>
      </div>
    </section>
  );
}
