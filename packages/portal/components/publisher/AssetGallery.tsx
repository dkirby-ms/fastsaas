import type { ListingAsset } from '@/lib/publisher/types';

interface AssetGalleryProps {
  assets: ListingAsset[];
  emptyMessage?: string;
}

function formatAssetType(assetType: string) {
  return assetType.replace(/[-_]/g, ' ');
}

export function AssetGallery({ assets, emptyMessage = 'No assets synced yet.' }: AssetGalleryProps) {
  if (assets.length === 0) {
    return <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">{emptyMessage}</div>;
  }

  const orderedAssets = [...assets].sort((left, right) => (left.displayOrder ?? Number.MAX_SAFE_INTEGER) - (right.displayOrder ?? Number.MAX_SAFE_INTEGER));

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {orderedAssets.map((asset) => (
        <article key={asset.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-panel">
          <div className="aspect-[4/3] bg-slate-100">
            <img src={asset.url} alt={asset.description || asset.resourceName} className="h-full w-full object-cover" loading="lazy" />
          </div>
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-950">{asset.resourceName}</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">{formatAssetType(asset.assetType)}</span>
            </div>
            {asset.description ? <p className="text-sm text-slate-500">{asset.description}</p> : null}
            <a href={asset.url} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold text-brand-700 transition hover:text-brand-800">
              Open full asset
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}
