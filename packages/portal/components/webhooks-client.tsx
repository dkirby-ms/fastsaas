'use client';

import { useState } from 'react';
import clsx from 'clsx';

interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: 'active' | 'inactive';
  lastDelivery: string;
}

const PLACEHOLDER_WEBHOOKS: Webhook[] = [
  {
    id: 'wh-1',
    url: 'https://api.acme.com/hooks/fastsaas',
    events: ['subscription.activated', 'subscription.canceled'],
    status: 'active',
    lastDelivery: '2 minutes ago',
  },
  {
    id: 'wh-2',
    url: 'https://hooks.slack.com/services/T0XXXX/BYYYYY/ZZZZZ',
    events: ['subscription.suspended', 'billing.failed'],
    status: 'inactive',
    lastDelivery: '3 days ago',
  },
];

function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        status === 'active'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
      )}
    >
      <span
        className={clsx(
          'h-1.5 w-1.5 rounded-full',
          status === 'active' ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500',
        )}
        aria-hidden="true"
      />
      {status === 'active' ? 'Active' : 'Inactive'}
    </span>
  );
}

function AddWebhookModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="add-webhook-title">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2 id="add-webhook-title" className="text-xl font-semibold text-slate-950 dark:text-slate-50">Add Webhook</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Configure an endpoint to receive real-time event notifications.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="webhook-url" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Endpoint URL
            </label>
            <input
              id="webhook-url"
              type="url"
              placeholder="https://your-app.com/webhooks/fastsaas"
              className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-950 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:placeholder:text-slate-500"
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-slate-700 dark:text-slate-300">Events to subscribe</p>
            <div className="mt-2 space-y-2">
              {['subscription.activated', 'subscription.canceled', 'subscription.suspended', 'billing.failed', 'seat.changed'].map((evt) => (
                <label key={evt} className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <input type="checkbox" className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-700" />
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{evt}</code>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
          >
            Save Webhook
          </button>
        </div>
      </div>
    </div>
  );
}

export function WebhooksClient() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      {showModal && <AddWebhookModal onClose={() => setShowModal(false)} />}

      <section className="space-y-6">
        <header className="rounded-3xl bg-slate-950 dark:bg-slate-900 px-6 py-8 text-white shadow-panel">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Custom Webhooks</p>
          <h1 className="mt-3 text-3xl font-semibold">Webhook Endpoints</h1>
          <p className="mt-3 max-w-2xl text-sm text-slate-300 dark:text-slate-400">
            Receive real-time event notifications when key lifecycle events happen on your subscription.
          </p>
        </header>

        <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Configured endpoints</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {PLACEHOLDER_WEBHOOKS.length} endpoint{PLACEHOLDER_WEBHOOKS.length !== 1 ? 's' : ''} configured
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
              </svg>
              Add Webhook
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {PLACEHOLDER_WEBHOOKS.map((webhook) => (
              <div key={webhook.id} className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="truncate rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                      {webhook.url}
                    </code>
                    <StatusBadge status={webhook.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {webhook.events.map((evt) => (
                      <span
                        key={evt}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      >
                        {evt}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                    Last delivery: {webhook.lastDelivery}
                  </p>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-brand-500 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-brand-400 dark:hover:text-brand-300"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:border-rose-400 hover:text-rose-700 dark:border-rose-800/50 dark:bg-slate-800 dark:text-rose-400 dark:hover:border-rose-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Supported events reference */}
        <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Supported events</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Subscribe your endpoints to any combination of these lifecycle events.
          </p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { event: 'subscription.activated', desc: 'A new subscription was successfully activated.' },
              { event: 'subscription.canceled', desc: 'A subscription was canceled by the customer or publisher.' },
              { event: 'subscription.suspended', desc: 'A subscription entered a suspended state due to non-payment.' },
              { event: 'billing.failed', desc: 'A billing attempt failed for a renewal or one-time charge.' },
              { event: 'seat.changed', desc: 'The number of purchased seats was increased or decreased.' },
              { event: 'plan.changed', desc: 'The customer switched to a different plan tier.' },
            ].map(({ event, desc }) => (
              <div key={event} className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 p-4">
                <dt>
                  <code className="text-xs font-medium text-brand-700 dark:text-brand-300">{event}</code>
                </dt>
                <dd className="mt-1 text-sm text-slate-500 dark:text-slate-400">{desc}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>
    </>
  );
}
