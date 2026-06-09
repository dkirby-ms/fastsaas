'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { PublisherTenantStatus } from '@fastsaas/shared';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import {
  getOperatorTenantsAction,
  type ActionResult,
} from '@/app/(portal)/operator/actions';
import { ApiError, getErrorMessage, isApiErrorStatus } from '@/lib/errors';

function unwrapResult<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new ApiError(result.message, result.status, result.code);
  return result.data;
}

const statusTone: Record<PublisherTenantStatus, string> = { active: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', trialing: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300', past_due: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300', suspended: 'bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300', canceled: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300' };

export function OperatorTenantsClient() {
  const tenantsQuery = useQuery({ queryKey: ['operator-tenants'], queryFn: () => getOperatorTenantsAction().then(unwrapResult) });

  if (tenantsQuery.isLoading) return <LoadingPanel label="Loading operator tenants" />;
  if (tenantsQuery.isError) {
    const error = tenantsQuery.error;
    if (isApiErrorStatus(error, 403)) {
      return <ForbiddenState message={getErrorMessage(error, 'This account does not have operator access.')} href="/dashboard" cta="Open customer portal" />;
    }
    return <ErrorAlert message={getErrorMessage(error, 'We could not load operator tenants.')} />;
  }
  if (!tenantsQuery.data) return <LoadingPanel label="Loading operator tenants" />;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Operator tenants</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">Provision and monitor tenants</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Track subscription status and route operators into the detail view for lifecycle actions.</p>
      </header>

      <div className="space-y-4">
        {tenantsQuery.data.tenants.map((tenant) => (
          <article key={tenant.id} className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">{tenant.displayName}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tenant.primaryDomain}</p></div><span className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${statusTone[tenant.status]}`}>{tenant.status.replace('_', ' ')}</span></div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4"><dt className="text-sm text-slate-500 dark:text-slate-400">Plan</dt><dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{tenant.planName}</dd></div><div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4"><dt className="text-sm text-slate-500 dark:text-slate-400">MRR</dt><dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{tenant.monthlyRecurringRevenue}</dd></div><div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4"><dt className="text-sm text-slate-500 dark:text-slate-400">Seats</dt><dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{tenant.seats}</dd></div></dl>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500 dark:text-slate-400">Updated {tenant.lastUpdated}</p><Link href={`/operator/tenants/${tenant.id}`} className="rounded-full border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300">View tenant</Link></div>
          </article>
        ))}
      </div>
    </section>
  );
}
