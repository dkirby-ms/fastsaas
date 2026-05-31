'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useMemo, useState } from 'react';
import type { PublisherTenantStatus, PublisherTenantUpsertInput } from '@fastsaas/shared';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

const emptyTenant: PublisherTenantUpsertInput = { displayName: '', primaryDomain: '', planId: 'starter', seats: 5, status: 'trialing' };
const statusTone: Record<PublisherTenantStatus, string> = { active: 'bg-emerald-100 text-emerald-700', trialing: 'bg-sky-100 text-sky-700', past_due: 'bg-amber-100 text-amber-700', suspended: 'bg-orange-100 text-orange-700', canceled: 'bg-rose-100 text-rose-700' };

export function PublisherTenantsClient() {
  const queryClient = useQueryClient();
  const tenantsQuery = useQuery({ queryKey: ['publisher-tenants'], queryFn: portalApi.getPublisherTenants });
  const plansQuery = useQuery({ queryKey: ['publisher-plans'], queryFn: portalApi.getPublisherPlans });
  const [formState, setFormState] = useState<PublisherTenantUpsertInput>(emptyTenant);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const createTenantMutation = useMutation({
    mutationFn: portalApi.createPublisherTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publisher-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['publisher-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['publisher-plans'] });
      setFormState(emptyTenant);
      setSuccessMessage('Tenant created.');
    },
  });

  const planOptions = useMemo(() => plansQuery.data?.plans ?? [], [plansQuery.data]);

  if (tenantsQuery.isLoading || plansQuery.isLoading) return <LoadingPanel label="Loading publisher tenants" />;
  if (tenantsQuery.isError || plansQuery.isError) {
    const error = tenantsQuery.error ?? plansQuery.error;
    if (isApiErrorStatus(error, 403)) {
      return <ForbiddenState message={getErrorMessage(error, 'This account does not have publisher access.')} href="/dashboard" cta="Open customer portal" />;
    }
    return <ErrorAlert message={getErrorMessage(error, 'We could not load publisher tenants.')} />;
  }
  if (!tenantsQuery.data || !plansQuery.data) return <LoadingPanel label="Loading publisher tenants" />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage(null);
    await createTenantMutation.mutateAsync(formState);
  };

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Publisher tenants</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Provision and monitor tenants</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-500">Create tenant records, track subscription status, and route operators into the detail view for lifecycle actions.</p>
      </header>

      {createTenantMutation.isError ? <ErrorAlert message={getErrorMessage(createTenantMutation.error, 'We could not create the tenant.')} /> : null}
      {successMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel" onSubmit={handleSubmit}>
          <h2 className="text-xl font-semibold text-slate-950">Create tenant</h2>
          <div className="mt-6 space-y-4">
            <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="tenant-display-name">Display name</label><input id="tenant-display-name" value={formState.displayName} onChange={(event) => setFormState((current) => ({ ...current, displayName: event.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" required /></div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="tenant-domain">Primary domain</label><input id="tenant-domain" value={formState.primaryDomain} onChange={(event) => setFormState((current) => ({ ...current, primaryDomain: event.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" placeholder="tenant.example" required /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="tenant-plan">Plan</label><select id="tenant-plan" value={formState.planId} onChange={(event) => setFormState((current) => ({ ...current, planId: event.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100">{planOptions.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></div>
              <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="tenant-seats">Seats</label><input id="tenant-seats" type="number" min={1} value={formState.seats} onChange={(event) => setFormState((current) => ({ ...current, seats: Number(event.target.value) || 1 }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></div>
            </div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="tenant-status">Starting status</label><select id="tenant-status" value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as PublisherTenantStatus }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"><option value="trialing">Trialing</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="past_due">Past due</option></select></div>
          </div>
          <button type="submit" disabled={createTenantMutation.isPending} className="mt-6 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">{createTenantMutation.isPending ? 'Creating…' : 'Create tenant'}</button>
        </form>

        <div className="space-y-4">
          {tenantsQuery.data.tenants.map((tenant) => (
            <article key={tenant.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-slate-950">{tenant.displayName}</h2><p className="mt-1 text-sm text-slate-500">{tenant.primaryDomain}</p></div><span className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${statusTone[tenant.status]}`}>{tenant.status.replace('_', ' ')}</span></div>
              <dl className="mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Plan</dt><dd className="mt-2 font-semibold text-slate-950">{tenant.planName}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">MRR</dt><dd className="mt-2 font-semibold text-slate-950">{tenant.monthlyRecurringRevenue}</dd></div><div className="rounded-2xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Seats</dt><dd className="mt-2 font-semibold text-slate-950">{tenant.seats}</dd></div></dl>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Updated {tenant.lastUpdated}</p><Link href={`/publisher/tenants/${tenant.id}`} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700">View tenant</Link></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
