'use client';

import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useMemo, useState } from 'react';
import type {
  CreatePublisherPlanInput,
  PlanFeatureGate,
  PublisherPlan,
  PublisherPlanStatus,
  PublisherPlanUpdateInput,
} from '@fastsaas/shared';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import {
  createPublisherPlanAction,
  getFeatureGatesAction,
  getMarketplacePlansAction,
  getPublisherPlansAction,
  removeFeatureGateAction,
  setFeatureGatesAction,
  updatePublisherPlanAction,
  type ActionResult,
} from '@/app/(portal)/publisher/actions';
import { ApiError } from '@/lib/errors';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

function unwrapResult<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new ApiError(result.message, result.status, result.code);
  return result.data;
}

type PlanFormState = {
  name: string;
  description: string;
  status: PublisherPlanStatus;
  marketplacePlanId: string;
  seatLimit: string;
};

type EditorState =
  | { mode: 'list' }
  | { mode: 'create' }
  | { mode: 'edit'; planId: string };

const emptyPlanForm: PlanFormState = {
  name: '',
  description: '',
  status: 'draft',
  marketplacePlanId: '',
  seatLimit: '',
};

const statusTone: Record<PublisherPlanStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  draft: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
};

function toPlanFormState(plan?: PublisherPlan): PlanFormState {
  if (!plan) {
    return emptyPlanForm;
  }

  return {
    name: plan.name,
    description: plan.description,
    status: plan.status,
    marketplacePlanId: plan.marketplacePlanId ?? '',
    seatLimit: plan.seatLimit?.toString() ?? '',
  };
}

function parsePlanFormState(formState: PlanFormState): { payload: PublisherPlanUpdateInput; error?: string } {
  const name = formState.name.trim();
  const description = formState.description.trim();
  const marketplacePlanId = formState.marketplacePlanId.trim();
  const seatLimitValue = formState.seatLimit.trim();

  if (!name || !description) {
    return {
      payload: {
        name,
        description,
        status: formState.status,
      },
      error: 'Name and description are required.',
    };
  }

  if (seatLimitValue) {
    const seatLimit = Number(seatLimitValue);
    if (!Number.isInteger(seatLimit) || seatLimit < 1) {
      return {
        payload: {
          name,
          description,
          status: formState.status,
        },
        error: 'Seat limit must be a whole number greater than zero, or left empty for unlimited.',
      };
    }
  }

  return {
    payload: {
      name,
      description,
      status: formState.status,
      marketplacePlanId: marketplacePlanId || null,
      seatLimit: seatLimitValue ? Number(seatLimitValue) : null,
    },
  };
}

function PartnerCenterWarning() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300" role="alert">
      <span aria-hidden="true" className="mt-0.5 shrink-0">⚠️</span>
      <span>This plan is not linked to a Partner Center plan. Link it to enable marketplace purchasing.</span>
    </div>
  );
}

function FeatureGatesPanel({ planId }: { planId: string }) {
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);
  const [addError, setAddError] = useState<string | null>(null);

  const gatesQuery = useQuery({
    queryKey: ['feature-gates', planId],
    queryFn: () => getFeatureGatesAction(planId).then(unwrapResult),
  });

  const setMutation = useMutation({
    mutationFn: ({ gates }: { gates: Array<{ featureKey: string; enabled: boolean }> }) =>
      setFeatureGatesAction(planId, gates).then(unwrapResult),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feature-gates', planId] }),
  });

  const removeMutation = useMutation({
    mutationFn: (featureKey: string) => removeFeatureGateAction(planId, featureKey).then(unwrapResult),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feature-gates', planId] }),
  });

  const gates: PlanFeatureGate[] = gatesQuery.data?.features ?? [];
  const isBusy = setMutation.isPending || removeMutation.isPending;

  const handleToggle = (gate: PlanFeatureGate) => {
    const updated = gates.map((g) =>
      g.featureKey === gate.featureKey ? { featureKey: g.featureKey, enabled: !g.enabled } : { featureKey: g.featureKey, enabled: g.enabled },
    );
    setMutation.mutate({ gates: updated });
  };

  const handleRemove = (featureKey: string) => {
    removeMutation.mutate(featureKey);
  };

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key) {
      setAddError('Feature key is required.');
      return;
    }
    if (gates.some((g) => g.featureKey === key)) {
      setAddError('A gate with this key already exists.');
      return;
    }
    setAddError(null);
    const updated = [...gates.map((g) => ({ featureKey: g.featureKey, enabled: g.enabled })), { featureKey: key, enabled: newEnabled }];
    setMutation.mutate(
      { gates: updated },
      {
        onSuccess: () => {
          setNewKey('');
          setNewEnabled(true);
        },
      },
    );
  };

  return (
    <div className="mt-8 space-y-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Feature Gates</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Control which features are enabled for this plan.</p>
      </div>

      {gatesQuery.isLoading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading feature gates…</p>
      ) : gatesQuery.isError ? (
        <ErrorAlert message={getErrorMessage(gatesQuery.error, 'Could not load feature gates.')} />
      ) : gates.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No feature gates configured for this plan.</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-slate-50 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/60">
          {gates.map((gate) => (
            <div key={gate.featureKey} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-medium text-slate-900 dark:text-slate-50">{gate.featureKey}</p>
                {gate.createdAt ? (
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Added {new Date(gate.createdAt).toLocaleDateString()}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleToggle(gate)}
                  className={clsx(
                    'rounded-full px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60',
                    gate.enabled
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-slate-600',
                  )}
                >
                  {gate.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleRemove(gate.featureKey)}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {setMutation.isError ? <ErrorAlert message={getErrorMessage(setMutation.error, 'Could not update feature gates.')} /> : null}
      {removeMutation.isError ? <ErrorAlert message={getErrorMessage(removeMutation.error, 'Could not remove feature gate.')} /> : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">Add feature gate</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label htmlFor="new-feature-key" className="mb-1 block text-xs text-slate-500 dark:text-slate-400">Feature key</label>
            <input
              id="new-feature-key"
              type="text"
              value={newKey}
              onChange={(e) => { setNewKey(e.target.value); setAddError(null); }}
              placeholder="e.g. advanced-reporting"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="new-feature-enabled"
              type="checkbox"
              checked={newEnabled}
              onChange={(e) => setNewEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            />
            <label htmlFor="new-feature-enabled" className="text-sm text-slate-700 dark:text-slate-200">Enabled</label>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={handleAdd}
            className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add gate
          </button>
        </div>
        {addError ? <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{addError}</p> : null}
      </div>
    </div>
  );
}

export function PublisherPlansClient() {
  const queryClient = useQueryClient();
  const plansQuery = useQuery({ queryKey: ['publisher-plans'], queryFn: () => getPublisherPlansAction().then(unwrapResult) });
  const marketplacePlansQuery = useQuery({
    queryKey: ['publisher-marketplace-plans'],
    queryFn: () => getMarketplacePlansAction().then(unwrapResult),
  });
  const [editorState, setEditorState] = useState<EditorState>({ mode: 'list' });
  const [formState, setFormState] = useState<PlanFormState>(emptyPlanForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const marketplacePlanOptions = useMemo(
    () =>
      Array.from(
        new Set((marketplacePlansQuery.data ?? []).map((plan) => plan.externalPlanId).filter((planId) => planId.trim().length > 0)),
      ).sort((left, right) => left.localeCompare(right)),
    [marketplacePlansQuery.data],
  );
  const selectedPlan = useMemo(
    () => (editorState.mode === 'edit' ? plansQuery.data?.plans.find((plan) => plan.id === editorState.planId) ?? null : null),
    [editorState, plansQuery.data],
  );

  const invalidatePublisherData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['publisher-plans'] }),
      queryClient.invalidateQueries({ queryKey: ['publisher-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['publisher-tenants'] }),
    ]);
  };

  const closeEditor = () => {
    setEditorState({ mode: 'list' });
    setFormState(emptyPlanForm);
    setFormError(null);
  };

  const openCreateForm = () => {
    setSuccessMessage(null);
    setFormError(null);
    setFormState(emptyPlanForm);
    setEditorState({ mode: 'create' });
  };

  const openEditForm = (plan: PublisherPlan) => {
    setSuccessMessage(null);
    setFormError(null);
    setFormState(toPlanFormState(plan));
    setEditorState({ mode: 'edit', planId: plan.id });
  };

  const createPlanMutation = useMutation({
    mutationFn: (payload: CreatePublisherPlanInput) => createPublisherPlanAction(payload).then(unwrapResult),
    onSuccess: async () => {
      await invalidatePublisherData();
      closeEditor();
      setSuccessMessage('Plan created.');
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ planId, payload }: { planId: string; payload: PublisherPlanUpdateInput }) => updatePublisherPlanAction(planId, payload).then(unwrapResult),
    onSuccess: async () => {
      await invalidatePublisherData();
      closeEditor();
      setSuccessMessage('Plan updated.');
    },
  });

  const isSaving = createPlanMutation.isPending || updatePlanMutation.isPending;

  if (plansQuery.isLoading) return <LoadingPanel label="Loading publisher plan catalog" />;
  if (plansQuery.isError) {
    if (isApiErrorStatus(plansQuery.error, 403)) {
      return <ForbiddenState message={getErrorMessage(plansQuery.error, 'This account does not have publisher access.')} href="/dashboard" cta="Open customer portal" />;
    }
    return <ErrorAlert message={getErrorMessage(plansQuery.error, 'We could not load publisher plans.')} />;
  }
  if (!plansQuery.data) return <LoadingPanel label="Loading publisher plan catalog" />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage(null);
    setFormError(null);

    const { payload, error } = parsePlanFormState(formState);
    if (error) {
      setFormError(error);
      return;
    }

    if (editorState.mode === 'create') {
      await createPlanMutation.mutateAsync({ ...payload, features: [] });
      return;
    }

    if (editorState.mode === 'edit') {
      await updatePlanMutation.mutateAsync({ planId: editorState.planId, payload });
    }
  };

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-panel dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Publisher plans</p>
            <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">Manage your subscription catalog</h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Keep pricing, seat limits, and marketplace linking aligned with the publisher experience.</p>
          </div>
          {editorState.mode === 'list' ? (
            <button type="button" onClick={openCreateForm} className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">
              Create plan
            </button>
          ) : null}
        </div>
      </header>

      {createPlanMutation.isError ? <ErrorAlert message={getErrorMessage(createPlanMutation.error, 'We could not create the plan.')} /> : null}
      {updatePlanMutation.isError ? <ErrorAlert message={getErrorMessage(updatePlanMutation.error, 'We could not save the plan updates.')} /> : null}
      {formError ? <ErrorAlert message={formError} /> : null}
      {successMessage ? <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{successMessage}</div> : null}

      {editorState.mode === 'list' ? (
        <div className="grid gap-6 xl:grid-cols-3">
          {plansQuery.data.plans.map((plan) => (
            <article key={plan.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">{plan.id}</p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-50">{plan.name}</h2>
                </div>
                <span className={clsx('rounded-full px-3 py-1 text-sm font-semibold capitalize', statusTone[plan.status])}>{plan.status}</span>
              </div>

              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">{plan.description}</p>

              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Pricing</dt>
                  <dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{plan.pricingSummary ? 'Synced from Partner Center' : 'No pricing available'}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Seat limit</dt>
                  <dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{plan.seatLimit ? `${plan.seatLimit} seats` : 'Unlimited'}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Marketplace link</dt>
                  <dd className="mt-2 text-sm font-semibold text-slate-950 dark:text-slate-50">{plan.marketplacePlanId ? `Linked · ${plan.marketplacePlanId}` : 'Not linked'}</dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <dt className="text-sm text-slate-500 dark:text-slate-400">Active subscriptions</dt>
                  <dd className="mt-2 font-semibold text-slate-950 dark:text-slate-50">{plan.activeSubscriptions}</dd>
                </div>
              </dl>

              <button type="button" onClick={() => openEditForm(plan)} className="mt-6 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700 dark:border-slate-600 dark:text-slate-200 dark:hover:text-brand-300">
                Edit
              </button>
              {plan.status === 'active' && !plan.marketplacePlanId ? (
                <div className="mt-4">
                  <PartnerCenterWarning />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel dark:border-slate-700 dark:bg-slate-900" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">{editorState.mode === 'create' ? 'Create plan' : selectedPlan?.id ?? 'Edit plan'}</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">{editorState.mode === 'create' ? 'Add a new subscription plan' : `Edit ${selectedPlan?.name ?? 'plan'}`}</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{editorState.mode === 'create' ? 'Set pricing, availability, seat limits, and marketplace linkage for the new catalog entry.' : `${selectedPlan?.activeSubscriptions ?? 0} active subscriptions currently use this plan.`}</p>
            </div>
          </div>

          {editorState.mode === 'edit' && selectedPlan?.status === 'active' && !selectedPlan?.marketplacePlanId ? (
            <div className="mt-4">
              <PartnerCenterWarning />
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="plan-name">Name</label><input id="plan-name" value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-600" required /></div>
            <div className="lg:col-span-2"><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="plan-description">Description</label><textarea id="plan-description" value={formState.description} onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))} className="min-h-32 w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-600" required /></div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="plan-status">Status</label><select id="plan-status" value={formState.status} onChange={(event) => setFormState((current) => ({ ...current, status: event.target.value as PublisherPlanStatus }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-600"><option value="active">Active</option><option value="draft">Draft</option></select></div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="plan-seat-limit">Seat limit</label><input id="plan-seat-limit" type="number" min={1} step={1} value={formState.seatLimit} onChange={(event) => setFormState((current) => ({ ...current, seatLimit: event.target.value }))} className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-600" placeholder="Unlimited" /></div>
            <div className="lg:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="plan-marketplace-id">Marketplace Plan ID</label>
              <input
                id="plan-marketplace-id"
                list={marketplacePlanOptions.length > 0 ? 'marketplace-plan-id-options' : undefined}
                value={formState.marketplacePlanId}
                onChange={(event) => setFormState((current) => ({ ...current, marketplacePlanId: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 dark:border-slate-600"
                placeholder="starter-monthly"
              />
              {marketplacePlanOptions.length > 0 ? (
                <datalist id="marketplace-plan-id-options">
                  {marketplacePlanOptions.map((planId) => (
                    <option key={planId} value={planId} />
                  ))}
                </datalist>
              ) : null}
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Enter the External Plan ID from the Marketplace Plans tab. Leave empty if this publisher plan is not linked.
                {marketplacePlanOptions.length > 0 ? ` ${marketplacePlanOptions.length} synced plan IDs are available as suggestions.` : ''}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={isSaving} className="rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">
              {isSaving ? (editorState.mode === 'create' ? 'Creating…' : 'Saving…') : editorState.mode === 'create' ? 'Create plan' : 'Save changes'}
            </button>
            <button type="button" onClick={closeEditor} disabled={isSaving} className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200">
              Cancel
            </button>
          </div>

          {editorState.mode === 'edit' ? <FeatureGatesPanel planId={editorState.planId} /> : null}
        </form>
      )}
    </section>
  );
}
