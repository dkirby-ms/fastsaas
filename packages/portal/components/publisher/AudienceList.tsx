import type { PreviewAudience, PrivateAudience } from '@fastsaas/shared';

type AudienceItem = PreviewAudience | PrivateAudience;

interface AudienceListProps {
  title: string;
  description: string;
  audiences: AudienceItem[];
  emptyMessage: string;
}

function getAudienceDetails(audience: AudienceItem) {
  if ('segmentDescription' in audience && audience.segmentDescription) {
    return audience.segmentDescription;
  }

  if ('description' in audience && audience.description) {
    return audience.description;
  }

  if ('count' in audience && typeof audience.count === 'number') {
    return `${audience.count} members`;
  }

  return 'No additional details were synced.';
}

export function AudienceList({ title, description, audiences, emptyMessage }: AudienceListProps) {
  return (
    <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">{title}</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{audiences.length}</span>
      </div>

      {audiences.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</div>
      ) : (
        <div className="mt-6 space-y-4">
          {audiences.map((audience) => (
            <article key={audience.id} className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">{audience.resourceName}</h3>
                <span className="rounded-full bg-white dark:bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 dark:text-slate-400">{audience.audienceType}</span>
              </div>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{getAudienceDetails(audience)}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
