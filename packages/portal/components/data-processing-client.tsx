'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeteringDashboardSummary } from '@fastsaas/shared';
import { useState } from 'react';
import {
  getMeteringDashboard,
  processRecords,
  type ActionResult,
  type ProcessRecordsResponse,
} from '@/app/(portal)/customer/actions';
import { ErrorAlert } from '@/components/error-alert';
import { LoadingPanel } from '@/components/loading-panel';
import { LockedFeature } from '@/components/locked-feature';
import { useHasFeature } from '@/components/features-provider';
import { ApiError, getErrorMessage } from '@/lib/errors';

interface DataProcessingClientProps {
  initialDashboardResult: ActionResult<MeteringDashboardSummary> | null;
  demoFunctionConfigured: boolean;
}

function unwrapResult<T>(result: ActionResult<T>): T {
  if (!result.ok) {
    throw new ApiError(result.message, result.status, result.code);
  }

  return result.data;
}

function generateSampleRecords(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `rec-${crypto.randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    type: ['page_view', 'api_call', 'file_upload', 'export'][i % 4],
    metadata: { source: 'demo', index: i + 1 },
  }));
}

function formatRelativeTime(value: string | null) {
  if (!value) return 'Never';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return formatter.format(diffHours, 'hour');
  }

  return formatter.format(Math.round(diffHours / 24), 'day');
}

function parseRecords(recordsText: string): object[] {
  const parsed = JSON.parse(recordsText) as unknown;

  if (!Array.isArray(parsed) || parsed.some((record) => !record || typeof record !== 'object' || Array.isArray(record))) {
    throw new Error('Paste a JSON array of record objects before processing.');
  }

  return parsed as object[];
}

export function DataProcessingClient({ initialDashboardResult, demoFunctionConfigured }: DataProcessingClientProps) {
  const hasFeature = useHasFeature('data-processing');
  const queryClient = useQueryClient();
  const [recordsText, setRecordsText] = useState(() => JSON.stringify(generateSampleRecords(10), null, 2));
  const [hasAttemptedSubmission, setHasAttemptedSubmission] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const meteringQuery = useQuery({
    queryKey: ['metering-dashboard'],
    queryFn: () => getMeteringDashboard().then(unwrapResult),
    initialData: initialDashboardResult?.ok ? initialDashboardResult.data : undefined,
  });
  const processMutation = useMutation({
    mutationFn: (records: object[]) => processRecords(records).then(unwrapResult),
    onSuccess: async () => {
      setClientError(null);
      await queryClient.invalidateQueries({ queryKey: ['metering-dashboard'] });
    },
  });

  if (!hasFeature) {
    return (
      <LockedFeature feature="data-processing" label="Data Processing">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Data processing</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">Automate record processing demos</h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Generate sample records, submit them to the demo function, and watch marketplace metering pipeline health update in real time.
          </p>
        </section>
      </LockedFeature>
    );
  }

  const dashboardError = meteringQuery.isError
    ? getErrorMessage(meteringQuery.error, 'We could not load the metering dashboard summary.')
    : !meteringQuery.data && initialDashboardResult && !initialDashboardResult.ok
      ? initialDashboardResult.message
      : null;
  const result = processMutation.data;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-panel dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Data processing</p>
        <h1 className="mt-3 text-3xl font-semibold">Turn sample records into metering events</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-300 dark:text-slate-400">
          Generate demo payloads, inspect the JSON, and submit usage records through the Azure Function-backed processing flow.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Record processing form</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Seed the textarea with sample payloads or edit the JSON before submitting.</p>
            </div>
            {processMutation.isPending ? <span className="text-sm font-medium text-brand-700 dark:text-brand-300">Processing…</span> : null}
          </div>

          {!demoFunctionConfigured ? (
            <div className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-500/30 dark:bg-amber-500/10">
              <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-200">⚙️ Data Processing Function Not Configured</h3>
              <p className="mt-3 text-sm text-amber-800 dark:text-amber-300">
                Set the DEMO_FUNCTION_URL environment variable to the Azure Function URL.
              </p>
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">See the demo function README for deployment instructions.</p>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setRecordsText(JSON.stringify(generateSampleRecords(10), null, 2))}
                  disabled={processMutation.isPending}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-400 dark:hover:text-brand-300"
                >
                  Generate 10 sample records
                </button>
                <button
                  type="button"
                  onClick={() => setRecordsText(JSON.stringify(generateSampleRecords(50), null, 2))}
                  disabled={processMutation.isPending}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-400 dark:hover:text-brand-300"
                >
                  Generate 50 sample records
                </button>
              </div>

              <label className="mt-6 block text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="records-json">
                Records JSON
              </label>
              <textarea
                id="records-json"
                value={recordsText}
                onChange={(event) => setRecordsText(event.target.value)}
                disabled={processMutation.isPending}
                className="mt-3 min-h-[360px] w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 font-mono text-sm text-slate-900 shadow-inner outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-500/20"
                spellCheck={false}
              />

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">Submit the current JSON payload to the configured Azure Function.</p>
                <button
                  type="button"
                  onClick={() => {
                    setHasAttemptedSubmission(true);
                    setClientError(null);

                    try {
                      processMutation.mutate(parseRecords(recordsText));
                    } catch (error) {
                      setClientError(error instanceof Error ? error.message : 'Enter valid JSON before processing.');
                    }
                  }}
                  disabled={processMutation.isPending}
                  className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processMutation.isPending ? 'Processing…' : 'Process Records'}
                </button>
              </div>
            </>
          )}
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Metering pipeline status</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Live submission health after each processing run.</p>
            </div>
            {meteringQuery.isFetching ? <span className="text-sm font-medium text-brand-700 dark:text-brand-300">Refreshing…</span> : null}
          </div>

          <div className="mt-6">
            {meteringQuery.isLoading && !meteringQuery.data ? (
              <LoadingPanel label="Loading metering pipeline status" />
            ) : dashboardError ? (
              <ErrorAlert message={dashboardError} />
            ) : meteringQuery.data ? (
              <dl className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Marketplace submissions</dt>
                  <dd className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">✓ {meteringQuery.data.submittedCount} events submitted to marketplace</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Pending</dt>
                  <dd className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">⏳ {meteringQuery.data.pendingCount} events pending</dd>
                </div>
                {meteringQuery.data.deadLetterCount > 0 ? (
                  <div className="rounded-2xl bg-rose-50 p-4 dark:bg-rose-500/10">
                    <dt className="text-sm text-rose-600 dark:text-rose-300">Dead-lettered</dt>
                    <dd className="mt-2 text-lg font-semibold text-rose-700 dark:text-rose-200">❌ {meteringQuery.data.deadLetterCount} dead-lettered</dd>
                  </div>
                ) : null}
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Submission SLA</dt>
                  <dd className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">SLA: {meteringQuery.data.submittedWithinSlaPercent}% submitted within window</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Last submitted</dt>
                  <dd className="mt-2 text-lg font-semibold text-slate-950 dark:text-slate-50">Last submitted: {formatRelativeTime(meteringQuery.data.lastSubmittedAt)}</dd>
                </div>
              </dl>
            ) : (
              <ErrorAlert message="Metering status is not available right now." />
            )}
          </div>
        </article>
      </div>

      {hasAttemptedSubmission ? (
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Result panel</h2>
          <div className="mt-6">
            {clientError ? (
              <ErrorAlert message={clientError} />
            ) : processMutation.isPending ? (
              <LoadingPanel label="Processing records" />
            ) : processMutation.isError ? (
              <ErrorAlert message={getErrorMessage(processMutation.error, 'We could not process those records.')} />
            ) : result ? (
              <dl className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Records processed</dt>
                  <dd className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{result.recordsProcessed}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Event ID</dt>
                  <dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{result.meteringEvent.eventId}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Dimension</dt>
                  <dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{result.meteringEvent.dimensionId}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Status</dt>
                  <dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{result.meteringEvent.status}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Deduplicated</dt>
                  <dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{result.meteringEvent.deduplicated ? 'Yes' : 'No'}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Quantity</dt>
                  <dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{result.meteringEvent.quantity}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Submit records to see processing results.</p>
            )}
          </div>
        </article>
      ) : null}
    </section>
  );
}
