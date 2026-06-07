'use client';

/** Human-readable labels for known feature keys. Unknown keys fall back to formatted key + generic copy. */
const FEATURE_METADATA: Record<string, { title: string; description: string }> = {
  'dark-mode': {
    title: 'Dark Mode',
    description: 'Switch between light and dark themes to match your working environment and reduce eye strain.',
  },
  'advanced-analytics': {
    title: 'Advanced Analytics',
    description: 'Unlock deeper usage insights, trend analysis, and exportable reports to understand how your team works.',
  },
  'export-csv': {
    title: 'CSV Export',
    description: 'Download your data as CSV files for offline analysis or import into your own tools.',
  },
  'custom-webhooks': {
    title: 'Custom Webhooks',
    description: 'Receive real-time event notifications when key lifecycle events happen on your subscription.',
  },
  'priority-support': {
    title: 'Priority Support',
    description: 'Get faster response times and dedicated support from the FastSaaS team.',
  },
  'multi-environment': {
    title: 'Multiple Environments',
    description: 'Manage separate staging and production environments under a single subscription.',
  },
  'custom-branding': {
    title: 'Custom Branding',
    description: 'Apply your own logo, colours, and domain to deliver a fully white-labelled experience.',
  },
  'api-access': {
    title: 'API Access',
    description: 'Integrate FastSaaS directly into your workflows with full REST API access and webhooks.',
  },
};

function formatFeatureKey(key: string): string {
  return key
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface UpgradePromptProps {
  feature: string;
  /** Optional custom description to override the default. */
  description?: string;
}

export function UpgradePrompt({ feature, description }: UpgradePromptProps) {
  const meta = FEATURE_METADATA[feature];
  const title = meta?.title ?? formatFeatureKey(feature);
  const copy = description ?? meta?.description ?? `Upgrade your plan to unlock ${formatFeatureKey(feature)} and more.`;

  return (
    <div className="flex flex-col items-start gap-4 rounded-3xl border border-purple-200 bg-purple-50 p-6 shadow-panel dark:border-purple-800/40 dark:bg-purple-950/20">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/40" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5 text-purple-600 dark:text-purple-400"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-600 dark:text-purple-400">Pro feature</p>
          <h3 className="mt-0.5 text-base font-semibold text-slate-950 dark:text-slate-50">{title}</h3>
        </div>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400">{copy}</p>

      <a
        href="/plan"
        className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 dark:bg-purple-500 dark:hover:bg-purple-400"
      >
        Upgrade plan
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path fillRule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z" clipRule="evenodd" />
        </svg>
      </a>
    </div>
  );
}
