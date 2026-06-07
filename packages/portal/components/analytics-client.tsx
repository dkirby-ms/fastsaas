'use client';

const USAGE_BARS = [
  { label: 'Week 1', value: 62 },
  { label: 'Week 2', value: 81 },
  { label: 'Week 3', value: 74 },
  { label: 'Week 4', value: 93 },
];

const FEATURE_USAGE = [
  { label: 'API Requests', value: 87 },
  { label: 'Data Exports', value: 54 },
  { label: 'Integrations', value: 41 },
  { label: 'Webhooks', value: 29 },
];

function StatCard({ label, value, trend }: { label: string; value: string; trend?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-5">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-slate-50">{value}</p>
      {trend && (
        <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">{trend}</p>
      )}
    </div>
  );
}

function BarChart() {
  const max = Math.max(...USAGE_BARS.map((b) => b.value));
  return (
    <div className="flex h-32 items-end gap-3">
      {USAGE_BARS.map((bar) => (
        <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{bar.value}%</span>
          <div
            className="w-full rounded-t-lg bg-brand-500 dark:bg-brand-400 transition-all"
            style={{ height: `${(bar.value / max) * 100}%` }}
            aria-label={`${bar.label}: ${bar.value}%`}
          />
          <span className="text-xs text-slate-400 dark:text-slate-500">{bar.label}</span>
        </div>
      ))}
    </div>
  );
}

function HorizontalBarChart() {
  const max = Math.max(...FEATURE_USAGE.map((f) => f.value));
  return (
    <div className="space-y-3">
      {FEATURE_USAGE.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-28 flex-none text-sm text-slate-600 dark:text-slate-400 truncate">{item.label}</span>
          <div className="flex-1 rounded-full bg-slate-100 dark:bg-slate-700 h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 dark:bg-brand-400"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className="w-10 flex-none text-right text-sm font-medium text-slate-600 dark:text-slate-300">
            {item.value}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsClient() {
  return (
    <section className="space-y-6">
      <header className="rounded-3xl bg-slate-950 dark:bg-slate-900 px-6 py-8 text-white shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Advanced Analytics</p>
        <h1 className="mt-3 text-3xl font-semibold">Usage Dashboard</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-300 dark:text-slate-400">
          Deep insights into your usage trends, API activity, and feature adoption across your subscription.
        </p>
      </header>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="API Calls (month)" value="24,817" trend="↑ 12% vs last month" />
        <StatCard label="Active Users" value="142" trend="↑ 8 new this week" />
        <StatCard label="Avg. Response Time" value="84ms" trend="↓ 6ms improvement" />
        <StatCard label="Error Rate" value="0.3%" trend="↓ 0.1% vs last month" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Usage This Month */}
        <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Usage This Month</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Weekly capacity utilisation (%)</p>
          <div className="mt-6">
            <BarChart />
          </div>
        </article>

        {/* API Calls Trend */}
        <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">API Calls — 30-Day Trend</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Requests per day (rolling average)</p>
          <div className="mt-6 space-y-4">
            <div className="flex items-end gap-4">
              <p className="text-5xl font-semibold text-slate-950 dark:text-slate-50">24.8k</p>
              <span className="mb-1 rounded-full bg-emerald-100 dark:bg-emerald-500/15 px-2.5 py-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                ↑ 12%
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Peak day: <span className="font-medium text-slate-700 dark:text-slate-300">Tuesday (1,243 calls)</span>
            </p>
            <dl className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                <dt className="text-xs text-slate-500 dark:text-slate-400">Successful</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">99.7%</dd>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                <dt className="text-xs text-slate-500 dark:text-slate-400">P95 latency</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">142ms</dd>
              </div>
            </dl>
          </div>
        </article>
      </div>

      {/* Feature Usage */}
      <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
        <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Feature Usage</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Percentage of available capacity consumed per feature area this month
        </p>
        <div className="mt-6">
          <HorizontalBarChart />
        </div>
      </article>
    </section>
  );
}
