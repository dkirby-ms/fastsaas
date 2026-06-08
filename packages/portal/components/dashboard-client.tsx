'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useSession } from 'next-auth/react';
import type { DashboardData, PortalAction } from '@fastsaas/shared';
import { getDashboard, runAction, type ActionResult } from '@/app/(portal)/customer/actions';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { LockedFeature } from '@/components/locked-feature';
import { ApiError } from '@/lib/errors';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';
import { hasPublisherAccess } from '@/lib/roles';

const stateTone: Record<NonNullable<DashboardData['subscription']>['state'], string> = {
  active: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  trialing: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
  past_due: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  suspended: 'bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-300',
  canceled: 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

const actionTone: Record<PortalAction['tone'], string> = {
  default: 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300',
  warning: 'border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-300 hover:border-amber-400',
  danger: 'border-rose-300 dark:border-rose-500/40 text-rose-700 dark:text-rose-300 hover:border-rose-400',
};

function downloadMockCsv(subscription: NonNullable<DashboardData['subscription']>, usage: NonNullable<DashboardData['usage']>) {
  const rows = [
    ['Field', 'Value'],
    ['Plan', subscription.planName],
    ['State', subscription.state],
    ['Billing Cycle', subscription.billingCycle],
    ['Amount', subscription.amount],
    ['Renewal Date', subscription.renewalDate],
    ['Tenant ID', subscription.tenantId],
    ['Active Members', String(usage.activeMembers)],
    ['Seats Purchased', String(usage.seatsPurchased)],
    ['API Requests (month)', String(usage.apiRequestsThisMonth)],
  ];
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'subscription-export.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function unwrapResult<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new ApiError(result.message, result.status, result.code);
  return result.data;
}

export function DashboardClient() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery({ queryKey: ['portal-dashboard'], queryFn: () => getDashboard().then(unwrapResult) });
  const actionMutation = useMutation({
    mutationFn: (actionId: string) => runAction(actionId).then(unwrapResult),
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-dashboard'], data);
      queryClient.invalidateQueries({ queryKey: ['portal-plans'] });
    },
  });

  if (dashboardQuery.isLoading) return <LoadingPanel label="Loading your subscription overview" />;
  if (dashboardQuery.isError) {
    if (isApiErrorStatus(dashboardQuery.error, 403)) {
      if (hasPublisherAccess(session?.roles)) {
        return <ForbiddenState message={getErrorMessage(dashboardQuery.error, 'This account cannot open the customer portal.')} href="/publisher" cta="Open publisher portal" />;
      }
      return <ForbiddenState title="No active subscription" message="You don't have an active subscription for this portal." href="/no-subscription" cta="Go to subscription page" />;
    }
    return <ErrorAlert message={getErrorMessage(dashboardQuery.error, 'We could not load your subscription overview.')} />;
  }
  if (!dashboardQuery.data) return <LoadingPanel label="Loading your subscription overview" />;

  const { subscription, usage, actions, user } = dashboardQuery.data;
  const firstName = user.name.trim().split(/\s+/).find(Boolean) ?? 'there';

  if (!subscription || !usage) {
    return <ErrorAlert message="We could not find an active subscription for this account." />;
  }

  return (
    <section className="space-y-6">
      <header className="grid gap-4 rounded-3xl bg-slate-950 dark:bg-slate-900 px-6 py-8 text-white shadow-panel lg:grid-cols-[2fr,1fr] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Subscription status</p>
          <h1 className="mt-3 text-3xl font-semibold">Welcome back, {firstName}</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300 dark:text-slate-400">Keep tabs on your subscription, billing cadence, and key lifecycle actions from one place.</p>
        </div>
        <dl className="rounded-3xl bg-white/10 dark:bg-white/5 p-5 backdrop-blur">
          <dt className="text-sm text-slate-300 dark:text-slate-400">Renewal date</dt>
          <dd className="mt-2 text-2xl font-semibold">{subscription.renewalDate}</dd>
          <dt className="mt-4 text-sm text-slate-300 dark:text-slate-400">Billing</dt>
          <dd className="mt-1 text-base font-medium">{subscription.amount} / {subscription.billingCycle}</dd>
        </dl>
      </header>

      {actionMutation.isError ? <ErrorAlert message={getErrorMessage(actionMutation.error, 'We could not complete that lifecycle action.')} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.3fr,0.7fr]">
        <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{subscription.planName}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tenant {subscription.tenantId}</p>
            </div>
            <div className="flex items-center gap-3">
              <LockedFeature feature="export-csv" label="Export CSV">
                <button
                  type="button"
                  onClick={() => downloadMockCsv(subscription, usage)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-400 dark:hover:text-brand-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z" />
                    <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z" />
                  </svg>
                  Export CSV
                </button>
              </LockedFeature>
              <span className={clsx('rounded-full px-3 py-1 text-sm font-semibold capitalize', stateTone[subscription.state])}>{subscription.state.replace('_', ' ')}</span>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4"><dt className="text-sm text-slate-500 dark:text-slate-400">Plan</dt><dd className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">{subscription.planName}</dd></div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4"><dt className="text-sm text-slate-500 dark:text-slate-400">Cycle</dt><dd className="mt-2 text-lg font-semibold capitalize text-slate-950 dark:text-slate-50">{subscription.billingCycle}</dd></div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4"><dt className="text-sm text-slate-500 dark:text-slate-400">Seat usage</dt><dd className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">{usage.activeMembers} / {usage.seatLimit ?? usage.seatsPurchased}</dd></div>
          </dl>
        </article>

        <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
          <h2 className="text-xl font-semibold">This month</h2>
          <dl className="mt-6 space-y-4">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4"><dt className="text-sm text-slate-500 dark:text-slate-400">API requests</dt><dd className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{usage.apiRequestsThisMonth.toLocaleString()}</dd></div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4"><dt className="text-sm text-slate-500 dark:text-slate-400">Customer contact</dt><dd className="mt-2 text-base font-medium text-slate-950 dark:text-slate-50">{user.email || 'No email on file'}</dd></div>
          </dl>
        </article>
      </div>

      <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Lifecycle actions</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Common subscription actions stay available even while the backend API is still landing.</p>
          </div>
          {actionMutation.isPending ? <span className="text-sm font-medium text-brand-700 dark:text-brand-300">Updating…</span> : null}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {actions.map((action) => (
            <section key={action.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">{action.label}</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{action.description}</p>
              <button type="button" className={clsx('mt-5 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60', actionTone[action.tone])} onClick={() => actionMutation.mutate(action.id)} disabled={actionMutation.isPending}>{action.label}</button>
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}
