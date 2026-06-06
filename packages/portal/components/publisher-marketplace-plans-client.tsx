'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { getMarketplacePlansAction, type ActionResult } from '@/app/(portal)/publisher/actions';
import { ApiError } from '@/lib/errors';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

function unwrapResult<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new ApiError(result.message, result.status, result.code);
  return result.data;
}

function getStatusClasses(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === 'active') {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
  }

  if (normalized === 'draft') {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
  }

  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
}

export function PublisherMarketplacePlansClient() {
  const marketplacePlansQuery = useQuery({
    queryKey: ['publisher-marketplace-plans'],
    queryFn: () => getMarketplacePlansAction().then(unwrapResult),
  });
  const [copiedPlanId, setCopiedPlanId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleCopy = async (externalPlanId: string) => {
    try {
      await navigator.clipboard.writeText(externalPlanId);
      setCopiedPlanId(externalPlanId);
      setCopyError(null);
      window.setTimeout(() => {
        setCopiedPlanId((current) => (current === externalPlanId ? null : current));
      }, 1500);
    } catch {
      setCopyError('Clipboard access is unavailable. Select and copy the External Plan ID manually.');
    }
  };

  if (marketplacePlansQuery.isLoading) return <LoadingPanel label="Loading marketplace plans" />;
  if (marketplacePlansQuery.isError) {
    if (isApiErrorStatus(marketplacePlansQuery.error, 403)) {
      return <ForbiddenState message={getErrorMessage(marketplacePlansQuery.error, 'This account does not have publisher access.')} href="/dashboard" cta="Open customer portal" />;
    }

    return <ErrorAlert message={getErrorMessage(marketplacePlansQuery.error, 'We could not load marketplace plans.')} />;
  }

  const marketplacePlans = marketplacePlansQuery.data ?? [];

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-panel dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Marketplace plans</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">Partner Center plan inventory</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
          Review synced marketplace plans and copy the External Plan ID when linking publisher plans.
        </p>
      </header>

      {copyError ? <ErrorAlert message={copyError} /> : null}

      {marketplacePlans.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-panel dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">No marketplace plans synced yet.</h2>
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Import a product from Partner Center to see plans here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-panel dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">External Plan ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Product ID</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Durable Plan ID</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {marketplacePlans.map((plan) => (
                  <tr key={`${plan.productId}:${plan.externalPlanId}`} className="align-top">
                    <td className="px-6 py-5">
                      <div className="font-mono text-sm font-semibold text-slate-950 dark:text-slate-50">{plan.externalPlanId}</div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Partner Center plan ID to paste into Publisher Plans.</p>
                    </td>
                    <td className="px-6 py-5 text-sm text-slate-600 dark:text-slate-300">{plan.productId}</td>
                    <td className="px-6 py-5">
                      <span className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${getStatusClasses(plan.status)}`}>{plan.status}</span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-mono text-sm text-slate-600 dark:text-slate-300">{plan.durablePlanId}</div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button
                        type="button"
                        onClick={() => handleCopy(plan.externalPlanId)}
                        className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700 dark:border-slate-600 dark:text-slate-200 dark:hover:text-brand-300"
                      >
                        {copiedPlanId === plan.externalPlanId ? 'Copied!' : 'Copy ID'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
