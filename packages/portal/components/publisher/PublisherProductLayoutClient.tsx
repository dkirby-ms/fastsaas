'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { ProductTabs } from '@/components/publisher/ProductTabs';
import { ReadOnlySyncBadge } from '@/components/publisher/read-only-sync-badge';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

function formatLifecycleState(value?: string) {
  if (!value) {
    return 'Unknown';
  }

  return value.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').trim();
}

interface PublisherProductLayoutClientProps {
  productId: string;
  children: React.ReactNode;
}

export function PublisherProductLayoutClient({ productId, children }: PublisherProductLayoutClientProps) {
  const productQuery = useQuery({ queryKey: ['publisher-product', productId], queryFn: () => portalApi.getPublisherProduct(productId) });

  if (productQuery.isLoading) return <LoadingPanel label="Loading publisher product" />;
  if (productQuery.isError) {
    if (isApiErrorStatus(productQuery.error, 403)) {
      return <ForbiddenState message={getErrorMessage(productQuery.error, 'This account does not have publisher access.')} href="/dashboard" cta="Open customer portal" />;
    }

    return <ErrorAlert message={getErrorMessage(productQuery.error, 'We could not load the publisher product.')} />;
  }
  if (!productQuery.data) return <LoadingPanel label="Loading publisher product" />;

  const product = productQuery.data;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Marketplace product</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950">{product.alias}</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-500">Offer {product.externalOfferId} • Durable product {product.durableProductId}</p>
          </div>
          <ReadOnlySyncBadge />
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <dt className="text-sm text-slate-500">Product type</dt>
            <dd className="mt-2 font-semibold text-slate-950">{product.productType}</dd>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <dt className="text-sm text-slate-500">Lifecycle state</dt>
            <dd className="mt-2 font-semibold text-slate-950">{formatLifecycleState(product.lifecycleState)}</dd>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4">
            <dt className="text-sm text-slate-500">Last synced</dt>
            <dd className="mt-2 font-semibold text-slate-950">{product.lastSyncedAt}</dd>
          </div>
        </dl>
      </header>

      <ProductTabs product={product} />
      {children}
    </section>
  );
}
