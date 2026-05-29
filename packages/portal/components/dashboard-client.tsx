'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import type { DashboardData, PortalAction } from '@fastsaas/shared';
import { ErrorAlert } from '@/components/error-alert';
import { LoadingPanel } from '@/components/loading-panel';
import { ApiError, portalApi } from '@/lib/api-client';

const stateTone: Record<DashboardData['subscription']['state'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trialing: 'bg-sky-100 text-sky-700',
  past_due: 'bg-amber-100 text-amber-700',
  suspended: 'bg-orange-100 text-orange-700',
  canceled: 'bg-rose-100 text-rose-700',
};

const actionTone: Record<PortalAction['tone'], string> = {
  default: 'border-slate-300 text-slate-700 hover:border-brand-500 hover:text-brand-700',
  warning: 'border-amber-300 text-amber-700 hover:border-amber-400',
  danger: 'border-rose-300 text-rose-700 hover:border-rose-400',
};

export function DashboardClient() {
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery({
    queryKey: ['portal-dashboard'],
    queryFn: portalApi.getDashboard,
  });

  const actionMutation = useMutation({
    mutationFn: portalApi.runAction,
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-dashboard'], data);
      queryClient.invalidateQueries({ queryKey: ['portal-plans'] });
    },
  });

  if (dashboardQuery.isLoading) {
    return <LoadingPanel label="Loading your subscription overview" />;
  }

  if (dashboardQuery.isError) {
    return <ErrorAlert message={(dashboardQuery.error as ApiError).userMessage} />;
  }

  if (!dashboardQuery.data) {
    return <LoadingPanel label="Loading your subscription overview" />;
  }

  const { subscription, usage, actions, user } = dashboardQuery.data;

  return (
    <section className="space-y-6">
      <header className="grid gap-4 rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-panel lg:grid-cols-[2fr,1fr] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Subscription status</p>
          <h1 className="mt-3 text-3xl font-semibold">Welcome back, {user.name.split(' ')[0]}</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            Keep tabs on your subscription, billing cadence, and key lifecycle actions from one place.
          </p>
        </div>
        <dl className="rounded-3xl bg-white/10 p-5 backdrop-blur">
          <dt className="text-sm text-slate-300">Renewal date</dt>
          <dd className="mt-2 text-2xl font-semibold">{subscription.renewalDate}</dd>
          <dt className="mt-4 text-sm text-slate-300">Billing</dt>
          <dd className="mt-1 text-base font-medium">{subscription.amount} / {subscription.billingCycle}</dd>
        </dl>
      </header>

      {actionMutation.isError ? <ErrorAlert message={(actionMutation.error as ApiError).userMessage} /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.3fr,0.7fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{subscription.planName}</h2>
              <p className="mt-1 text-sm text-slate-500">Tenant {subscription.tenantId}</p>
            </div>
            <span className={clsx('rounded-full px-3 py-1 text-sm font-semibold capitalize', stateTone[subscription.state])}>
              {subscription.state.replace('_', ' ')}
            </span>
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-sm text-slate-500">Plan</dt>
              <dd className="mt-2 text-lg font-semibold text-slate-950">{subscription.planName}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-sm text-slate-500">Cycle</dt>
              <dd className="mt-2 text-lg font-semibold capitalize text-slate-950">{subscription.billingCycle}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-sm text-slate-500">Seat usage</dt>
              <dd className="mt-2 text-lg font-semibold text-slate-950">{usage.activeMembers} / {usage.seatsPurchased}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
          <h2 className="text-xl font-semibold">This month</h2>
          <dl className="mt-6 space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-sm text-slate-500">API requests</dt>
              <dd className="mt-2 text-2xl font-semibold text-slate-950">{usage.apiRequestsThisMonth.toLocaleString()}</dd>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <dt className="text-sm text-slate-500">Customer contact</dt>
              <dd className="mt-2 text-base font-medium text-slate-950">{user.email}</dd>
            </div>
          </dl>
        </article>
      </div>

      <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Lifecycle actions</h2>
            <p className="mt-1 text-sm text-slate-500">Common subscription actions stay available even while the backend API is still landing.</p>
          </div>
          {actionMutation.isPending ? <span className="text-sm font-medium text-brand-700">Updating…</span> : null}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {actions.map((action) => (
            <section key={action.id} className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-base font-semibold text-slate-950">{action.label}</h3>
              <p className="mt-2 text-sm text-slate-500">{action.description}</p>
              <button
                type="button"
                className={clsx('mt-5 rounded-full border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60', actionTone[action.tone])}
                onClick={() => actionMutation.mutate(action.id)}
                disabled={actionMutation.isPending}
              >
                {action.label}
              </button>
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}
