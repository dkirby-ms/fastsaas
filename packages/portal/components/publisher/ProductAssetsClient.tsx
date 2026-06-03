'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { AssetGallery } from '@/components/publisher/AssetGallery';
import { VideoPlayer } from '@/components/publisher/VideoPlayer';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

interface ProductAssetsClientProps {
  productId: string;
}

export function ProductAssetsClient({ productId }: ProductAssetsClientProps) {
  const assetsQuery = useQuery({ queryKey: ['publisher-product-assets', productId], queryFn: () => portalApi.getPublisherProductAssets(productId) });

  if (assetsQuery.isLoading) return <LoadingPanel label="Loading listing assets" />;
  if (assetsQuery.isError) {
    if (isApiErrorStatus(assetsQuery.error, 403)) {
      return <ForbiddenState message={getErrorMessage(assetsQuery.error, 'This account does not have publisher access.')} href="/dashboard" cta="Open customer portal" />;
    }

    return <ErrorAlert message={getErrorMessage(assetsQuery.error, 'We could not load listing assets.')} />;
  }
  if (!assetsQuery.data) return <LoadingPanel label="Loading listing assets" />;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Assets</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-slate-50">Listing images and trailers</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Review the image gallery and embedded trailers currently synced from Partner Center.</p>
      </header>

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Asset gallery</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Screenshots, logos, and thumbnails appear here in their synced display order.</p>
        </div>
        <AssetGallery assets={assetsQuery.data.assets} emptyMessage="No assets synced yet." />
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Trailers</h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Embedded marketplace trailers and demo videos for this product.</p>
        </div>

        {assetsQuery.data.trailers.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No trailers synced yet.</div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            {assetsQuery.data.trailers.map((trailer) => (
              <VideoPlayer key={trailer.id} trailer={trailer} />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
