import { getPublisherIntegrationMode, publisherAdminContracts } from '@/lib/publisher-admin-api';

export function PublisherIntegrationBanner() {
  const mode = getPublisherIntegrationMode();

  if (mode === 'live') {
    return (
      <section className="rounded-3xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-6 py-5 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Publisher API</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">Connected to dedicated publisher-admin endpoints</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Publisher workflows are using the RBAC-aware admin contract instead of tenant-scoped subscription routes.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 px-6 py-5 shadow-panel">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">Publisher API</p>
      <h2 className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">Using the publisher mock adapter</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Publisher workflows stay interactive until dedicated admin routes are enabled. The integration points are:
      </p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
        {publisherAdminContracts.map((contract) => (
          <li key={`${contract.method}-${contract.path}`} className="rounded-2xl bg-white/80 dark:bg-slate-900/80 px-4 py-3">
            <span className="font-semibold text-slate-950 dark:text-slate-50">{contract.method}</span>{' '}
            <code className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200">{contract.path}</code>
            <span className="ml-2 text-slate-500 dark:text-slate-400">— {contract.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
