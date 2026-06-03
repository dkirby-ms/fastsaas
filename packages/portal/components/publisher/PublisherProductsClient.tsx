'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { ReadOnlySyncBadge } from '@/components/publisher/read-only-sync-badge';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

function formatLifecycleState(value?: string) {
  if (!value) {
    return 'Unknown';
  }

  return value.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').trim();
}

export function PublisherProductsClient() {
  const productsQuery = useQuery({ queryKey: ['publisher-products'], queryFn: portalApi.getPublisherProducts });

  if (productsQuery.isLoading) return <LoadingPanel label="Loading publisher products" />;
  if (productsQuery.isError) {
    if (isApiErrorStatus(productsQuery.error, 403)) {
      return <ForbiddenState message={getErrorMessage(productsQuery.error, 'This account does not have publisher access.')} href="/dashboard" cta="Open customer portal" />;
    }

    return <ErrorAlert message={getErrorMessage(productsQuery.error, 'We could not load marketplace products.')} />;
  }
  if (!productsQuery.data) return <LoadingPanel label="Loading publisher products" />;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Publisher products</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">Review marketplace listing visibility</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Open a product to inspect synced assets, audience targeting, and per-plan pricing without leaving the publisher portal.</p>
          </div>
          <ReadOnlySyncBadge />
        </div>
      </header>

      {productsQuery.data.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400 shadow-panel">No products synced yet.</div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {productsQuery.data.map((product) => (
            <article key={product.id} className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">{product.productType}</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{product.alias}</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Offer {product.externalOfferId}</p>
                </div>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{formatLifecycleState(product.lifecycleState)}</span>
              </div>

              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Durable product ID</dt>
                  <dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{product.durableProductId}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Last synced</dt>
                  <dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{product.lastSyncedAt}</dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={`/publisher/products/${product.id}/assets`} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
                  View assets
                </Link>
                <Link href={`/publisher/products/${product.id}/audiences`} className="rounded-full border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition hover:border-brand-500 hover:text-brand-700 dark:hover:text-brand-300">
                  View audiences
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
