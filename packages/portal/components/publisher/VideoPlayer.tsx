import type { ListingTrailer } from '@fastsaas/shared';

interface VideoPlayerProps {
  trailer: ListingTrailer;
}

function formatDuration(duration?: number) {
  if (!duration || duration <= 0) {
    return null;
  }

  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function VideoPlayer({ trailer }: VideoPlayerProps) {
  const duration = formatDuration(trailer.duration);

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-panel">
      <div className="aspect-video bg-slate-950 dark:bg-slate-900">
        <video className="h-full w-full" controls preload="metadata" poster={trailer.thumbnailUrl}>
          <source src={trailer.url} />
          Your browser does not support embedded video playback.
        </video>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">{trailer.resourceName}</h3>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-400">{trailer.trailerType}</span>
          {duration ? <span className="rounded-full bg-brand-50 dark:bg-brand-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-700 dark:text-brand-300">{duration}</span> : null}
        </div>
        <a href={trailer.url} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold text-brand-700 dark:text-brand-300 transition hover:text-brand-800 dark:hover:text-brand-200">
          Open trailer in a new tab
        </a>
      </div>
    </article>
  );
}
