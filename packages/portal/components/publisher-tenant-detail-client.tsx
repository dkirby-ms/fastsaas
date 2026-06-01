'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import type { PublisherTenantStatus, PublisherTenantUpsertInput } from '@fastsaas/shared';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

const statusTone: Record<PublisherTenantStatus, string> = { active: 'bg-emerald-100 text-emerald-700', trialing: 'bg-sky-100 text-sky-700', past_due: 'bg-amber-100 text-amber-700', suspended: 'bg-orange-100 text-orange-700', canceled: 'bg-rose-100 text-rose-700' };
const emptyTenant: PublisherTenantUpsertInput = { displayName: '', primaryDomain: '', planId: 'starter', seats: 1, status: 'trialing' };

export function PublisherTenantDetailClient({ tenantId }: Readonly<{ tenantId: string }>) {
  const queryClient = useQueryClient();
  const tenantQuery = useQuery({ queryKey: ['publisher-tenant', tenantId], queryFn: () => portalApi.getPublisherTenant(tenantId) });
  const plansQuery = useQuery({ queryKey: ['publisher-plans'], queryFn: portalApi.getPublisherPlans });
  const [formState, setFormState] = useState<PublisherTenantUpsertInput>(emptyTenant);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantQuery.data) return;
    setFormState({ displayName: tenantQuery.data.displayName, primaryDomain: tenantQuery.data.primaryDomain, planId: tenantQuery.data.planId, seats: tenantQuery.data.seats, status: tenantQuery.data.status });
  }, [tenantQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (payload: PublisherTenantUpsertInput) => portalApi.updatePublisherTenant(tenantId, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['publisher-tenant', tenantId], data);
      queryClient.invalidateQueries({ queryKey: ['publisher-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['publisher-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['publisher-plans'] });
      setSuccessMessage('Tenant updates saved.');
    },
  });

  const actionMutation = useMutation({
    mutationFn: async (action: 'activate' | 'suspend' | 'cancel') => {
      const subscriptionId = tenantQuery.data?.subscriptionId ?? tenantId;
      if (action === 'activate') return portalApi.activatePublisherTenant(subscriptionId);
      if (action === 'suspend') return portalApi.suspendPublisherTenant(subscriptionId);
      return portalApi.cancelPublisherTenant(subscriptionId);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['publisher-tenant', tenantId], data);
      queryClient.invalidateQueries({ queryKey: ['publisher-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['publisher-dashboard'] });
      setSuccessMessage('Tenant status updated.');
    },
  });

  if (tenantQuery.isLoading || plansQuery.isLoading) return <LoadingPanel label="Loading tenant detail" />;
  if (tenantQuery.isError || plansQuery.isError) {
    const error = tenantQuery.error ?? plansQuery.error;
    if (isApiErrorStatus(error, 403)) {
      return <ForbiddenState message={getErrorMessage(error, 'This account does not have publisher access.')} href="/dashboard" cta="Open customer portal" />;
    }
    return <ErrorAlert message={getErrorMessage(error, 'We could not load that tenant.')} />;
  }
  if (!tenantQuery.data || !plansQuery.data) return <LoadingPanel label="Loading tenant detail" />;

  const tenant = tenantQuery.data;
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage(null);
    await updateMutation.mutateAsync(formState);
  };

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Tenant detail</p><h1 className="mt-3 text-3xl font-semibold text-slate-950">{tenant.displayName}</h1><p className="mt-2 text-sm text-slate-500">{tenant.primaryDomain}</p></div><span className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${statusTone[tenant.status]}`}>{tenant.status.replace('_', ' ')}</span></div></header>
      {(updateMutation.isError || actionMutation.isError) ? <ErrorAlert message={getErrorMessage(updateMutation.error ?? actionMutation.error, 'We could not save tenant changes.')} /> : null}
      {successMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel" onSubmit={handleSubmit}>
          <h2 className="text-xl font-semibold text-slate-950">Tenant settings</h2>
          <div className="mt-6 space-y-4">
            <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="tenant-name">Display name</label><input id="tenant-name" value={formState.displayName} onChange={(event) => setFormState((current) => ({ ...current, displayName: event.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" required /></div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="tenant-primary-domain">Primary domain</label><input id="tenant-primary-domain" value={formState.primaryDomain} onChange={(event) => setFormState((current) => ({ ...current, primaryDomain: event.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" required /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="tenant-plan-id">Plan</label><select id="tenant-plan-id" value={formState.planId} onChange={(event) => setFormState((current) => ({ ...current, planId: event.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100">{plansQuery.data.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div>
              <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="tenant-seat-count">Seats</label><input id="tenant-seat-count" type="number" min={1} value={formState.seats} onChange={(event) => setFormState((current) => ({ ...current, seats: Number(event.target.value) || 1 }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></div>
            </div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="tenant-status-field">Status</label><select id="tenant-status-field" value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as PublisherTenantStatus }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"><option value="trialing">Trialing</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="past_due">Past due</option><option value="canceled">Canceled</option></select></div>
          </div>
          <button type="submit" disabled={updateMutation.isPending} className="mt-6 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">{updateMutation.isPending ? 'Saving…' : 'Save tenant'}</button>
        </form>

        <div className="space-y-6">
          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
            <h2 className="text-xl font-semibold text-slate-950">Subscription + usage</h2>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Plan</dt><dd className="mt-2 font-semibold text-slate-950">{tenant.planName}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">MRR</dt><dd className="mt-2 font-semibold text-slate-950">{tenant.monthlyRecurringRevenue}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Active users</dt><dd className="mt-2 font-semibold text-slate-950">{tenant.usage.activeUsers}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">API requests</dt><dd className="mt-2 font-semibold text-slate-950">{tenant.usage.apiRequestsThisMonth.toLocaleString()}</dd></div><div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2"><dt className="text-sm text-slate-500">Storage</dt><dd className="mt-2 font-semibold text-slate-950">{tenant.usage.storageGb} GB</dd></div></dl>
            <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => actionMutation.mutate('activate')} disabled={actionMutation.isPending} className="rounded-full border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">Activate</button><button type="button" onClick={() => actionMutation.mutate('suspend')} disabled={actionMutation.isPending} className="rounded-full border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-700 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60">Suspend</button><button type="button" onClick={() => actionMutation.mutate('cancel')} disabled={actionMutation.isPending} className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60">Cancel</button></div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
            <h2 className="text-xl font-semibold text-slate-950">Activity</h2>
            <div className="mt-6 space-y-3">{tenant.audit.map((entry) => <div key={entry.id} className="rounded-2xl bg-slate-50 px-4 py-3"><p className="font-medium text-slate-950">{entry.label}</p><p className="mt-1 text-sm text-slate-500">{entry.timestamp}</p></div>)}</div>
          </article>
        </div>
      </div>
    </section>
  );
}
