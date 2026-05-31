'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PublisherPlanUpdateInput } from '@fastsaas/shared';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

type DraftState = Record<string, PublisherPlanUpdateInput>;

export function PublisherPlansClient() {
  const queryClient = useQueryClient();
  const plansQuery = useQuery({ queryKey: ['publisher-plans'], queryFn: portalApi.getPublisherPlans });
  const [drafts, setDrafts] = useState<DraftState>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!plansQuery.data) return;
    setDrafts(Object.fromEntries(plansQuery.data.plans.map((plan) => [plan.id, { name: plan.name, description: plan.description, priceMonthly: plan.priceMonthly, status: plan.status }])));
  }, [plansQuery.data]);

  const updatePlanMutation = useMutation({
    mutationFn: ({ planId, payload }: { planId: string; payload: PublisherPlanUpdateInput }) => portalApi.updatePublisherPlan(planId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['publisher-plans'], data);
      queryClient.invalidateQueries({ queryKey: ['publisher-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['publisher-tenants'] });
      setSuccessMessage('Plan updates saved.');
    },
  });

  if (plansQuery.isLoading) return <LoadingPanel label="Loading publisher plan catalog" />;
  if (plansQuery.isError) {
    if (isApiErrorStatus(plansQuery.error, 403)) {
      return <ForbiddenState message={getErrorMessage(plansQuery.error, 'This account does not have publisher access.')} href="/dashboard" cta="Open customer portal" />;
    }
    return <ErrorAlert message={getErrorMessage(plansQuery.error, 'We could not load publisher plans.')} />;
  }
  if (!plansQuery.data) return <LoadingPanel label="Loading publisher plan catalog" />;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Publisher plans</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Manage your subscription catalog</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-500">Keep pricing and lifecycle readiness aligned with the publisher experience. Dedicated APIs can replace this client abstraction without reworking the UI.</p>
      </header>

      {updatePlanMutation.isError ? <ErrorAlert message={getErrorMessage(updatePlanMutation.error, 'We could not save the plan updates.')} /> : null}
      {successMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        {plansQuery.data.plans.map((plan) => {
          const draft = drafts[plan.id];
          return (
            <article key={plan.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
              <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">{plan.id}</p><h2 className="mt-2 text-xl font-semibold text-slate-950">{plan.name}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{plan.activeSubscriptions} tenants</span></div>
              <div className="mt-6 space-y-4">
                <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={`${plan.id}-name`}>Name</label><input id={`${plan.id}-name`} value={draft?.name ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [plan.id]: { ...(current[plan.id] ?? draft), name: event.target.value } }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></div>
                <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={`${plan.id}-description`}>Description</label><textarea id={`${plan.id}-description`} value={draft?.description ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [plan.id]: { ...(current[plan.id] ?? draft), description: event.target.value } }))} className="min-h-28 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={`${plan.id}-price`}>Monthly price</label><input id={`${plan.id}-price`} value={draft?.priceMonthly ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [plan.id]: { ...(current[plan.id] ?? draft), priceMonthly: event.target.value } }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></div>
                  <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor={`${plan.id}-status`}>Status</label><select id={`${plan.id}-status`} value={draft?.status ?? 'draft'} onChange={(event) => setDrafts((current) => ({ ...current, [plan.id]: { ...(current[plan.id] ?? draft), status: event.target.value as PublisherPlanUpdateInput['status'] } }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"><option value="active">Active</option><option value="draft">Draft</option></select></div>
                </div>
              </div>
              <ul className="mt-6 space-y-2 text-sm text-slate-500">{plan.features.map((feature) => <li key={feature} className="rounded-2xl bg-slate-50 px-4 py-3">{feature}</li>)}</ul>
              <button type="button" onClick={() => draft && updatePlanMutation.mutate({ planId: plan.id, payload: draft })} disabled={updatePlanMutation.isPending} className="mt-6 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">{updatePlanMutation.isPending ? 'Saving…' : 'Save plan'}</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
