'use client';

import type { Subscription } from '@fastsaas/shared';
import clsx from 'clsx';
import { ErrorAlert } from '@/components/error-alert';

const statusTone: Record<Subscription['status'], string> = {
  PendingActivation: 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200',
  Active: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  Suspended: 'bg-orange-100 dark:bg-orange-500/10 text-orange-800 dark:text-orange-200',
  Unsubscribed: 'bg-rose-100 dark:bg-rose-500/15 text-rose-800 dark:text-rose-200',
};

function formatPlanName(subscription: Subscription): string {
  const metadata = subscription.metadata as Record<string, unknown>;
  const configuredName = metadata.planName ?? metadata.planDisplayName;

  if (typeof configuredName === 'string' && configuredName.trim().length > 0) {
    return configuredName.trim();
  }

  return subscription.planId
    .split(/[-_\s]+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getStatusMessage(status: Subscription['status']): string {
  switch (status) {
    case 'Active':
      return 'This subscription is already active. You can continue into the customer dashboard.';
    case 'Suspended':
      return 'This subscription is currently suspended. Contact support if you expected a new activation.';
    case 'Unsubscribed':
      return 'This subscription is no longer active. Contact support if you need help restoring access.';
    case 'PendingActivation':
    default:
      return 'Review the marketplace purchase details below, then activate the subscription to finish onboarding.';
  }
}

export function LandingConfirmationCard({
  subscription,
  isResolving,
  isActivating,
  resolveError,
  activateError,
  onRetryResolve,
  onActivate,
  onOpenDashboard,
}: {
  subscription?: Subscription;
  isResolving: boolean;
  isActivating: boolean;
  resolveError?: string | null;
  activateError?: string | null;
  onRetryResolve: () => void;
  onActivate: () => void;
  onOpenDashboard: () => void;
}) {
  const isActive = subscription?.status === 'Active';
  const canActivate = subscription?.status === 'PendingActivation';
  const assignedTenant = subscription?.beneficiaryTenantId ?? subscription?.tenantId;
  const purchaserTenant = subscription?.purchaserTenantId ?? 'Not provided by Marketplace';

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <header className="rounded-3xl bg-slate-950 dark:bg-slate-900 px-6 py-8 text-white shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Azure Marketplace</p>
        <h1 className="mt-3 text-3xl font-semibold">Finish subscription onboarding</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-300 dark:text-slate-400">
          FastSaaS received your marketplace purchase. Confirm the subscription details and activate access for your workspace.
        </p>
      </header>

      <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
        {isResolving && !subscription ? (
          <div className="flex min-h-[280px] items-center justify-center" role="status" aria-live="polite">
            <div className="text-center">
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 dark:border-slate-700 border-t-brand-600" aria-hidden="true" />
              <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Resolving your Marketplace subscription…</p>
            </div>
          </div>
        ) : resolveError ? (
          <div className="space-y-4">
            <ErrorAlert message={resolveError} />
            <button
              type="button"
              onClick={onRetryResolve}
              className="rounded-full border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300"
            >
              Retry
            </button>
          </div>
        ) : subscription ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Subscription status</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{formatPlanName(subscription)}</h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{getStatusMessage(subscription.status)}</p>
              </div>
              <span className={clsx('rounded-full px-3 py-1 text-sm font-semibold', statusTone[subscription.status])}>
                {subscription.status.replace(/([a-z])([A-Z])/g, '$1 $2')}
              </span>
            </div>

            <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4">
                <dt className="text-sm text-slate-500 dark:text-slate-400">Plan</dt>
                <dd className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">{formatPlanName(subscription)}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4">
                <dt className="text-sm text-slate-500 dark:text-slate-400">Seats</dt>
                <dd className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">{subscription.seats}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4">
                <dt className="text-sm text-slate-500 dark:text-slate-400">Assigned tenant</dt>
                <dd className="mt-2 break-all text-sm font-semibold text-slate-950 dark:text-slate-50">{assignedTenant}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4">
                <dt className="text-sm text-slate-500 dark:text-slate-400">Purchasing tenant</dt>
                <dd className="mt-2 break-all text-sm font-semibold text-slate-950 dark:text-slate-50">{purchaserTenant}</dd>
              </div>
            </dl>

            <dl className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                <dt className="text-sm text-slate-500 dark:text-slate-400">Marketplace subscription</dt>
                <dd className="mt-2 break-all text-sm font-medium text-slate-900 dark:text-slate-100">{subscription.marketplaceSubscriptionId}</dd>
              </div>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                <dt className="text-sm text-slate-500 dark:text-slate-400">FastSaaS subscription</dt>
                <dd className="mt-2 break-all text-sm font-medium text-slate-900 dark:text-slate-100">{subscription.id}</dd>
              </div>
            </dl>

            {activateError ? <ErrorAlert message={activateError} /> : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={isActive ? onOpenDashboard : onActivate}
                disabled={isActivating || (!canActivate && !isActive)}
                className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isActivating ? 'Activating…' : isActive ? 'Open dashboard' : 'Activate Subscription'}
              </button>
              <button
                type="button"
                onClick={onRetryResolve}
                disabled={isResolving || isActivating}
                className="rounded-full border border-slate-300 dark:border-slate-600 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Refresh details
              </button>
            </div>
          </div>
        ) : null}
      </article>
    </section>
  );
}
