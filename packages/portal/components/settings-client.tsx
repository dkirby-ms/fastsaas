'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { type FormEvent, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import type { SettingsData } from '@fastsaas/shared';
import { getSettings, updateSettings, type ActionResult } from '@/app/(portal)/customer/actions';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { ApiError } from '@/lib/errors';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';
import { hasOperatorAccess } from '@/lib/roles';

const emptySettings: SettingsData = { displayName: '', email: '', company: '', timezone: 'America/Chicago', notificationsEnabled: true };
const profileFieldClassName = 'w-full rounded-2xl border border-slate-300 dark:border-slate-600 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:bg-slate-800/70 dark:disabled:text-slate-400';
const preferenceFieldClassName = 'w-full rounded-2xl border border-slate-300 dark:border-slate-600 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

function unwrapResult<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new ApiError(result.message, result.status, result.code);
  return result.data;
}

export function SettingsClient() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['portal-settings'], queryFn: () => getSettings().then(unwrapResult) });
  const [formState, setFormState] = useState<SettingsData>(emptySettings);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQuery.data) setFormState(settingsQuery.data);
  }, [settingsQuery.data]);

  const updateSettingsMutation = useMutation({
    mutationFn: (payload: SettingsData) => updateSettings(payload).then(unwrapResult),
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-settings'], data);
      setSuccessMessage('Your settings were saved.');
    },
  });

  if (settingsQuery.isLoading) return <LoadingPanel label="Loading your account settings" />;
  if (settingsQuery.isError) {
    if (isApiErrorStatus(settingsQuery.error, 403)) {
      if (hasOperatorAccess(session?.roles)) {
        return <ForbiddenState message={getErrorMessage(settingsQuery.error, 'This account cannot open customer settings.')} href="/operator" cta="Open operator portal" />;
      }
      return <ForbiddenState title="No active subscription" message="You don't have an active subscription for this portal." href="/no-subscription" cta="Go to subscription page" />;
    }
    return <ErrorAlert message={getErrorMessage(settingsQuery.error, 'We could not load your account settings.')} />;
  }
  if (!settingsQuery.data) return <LoadingPanel label="Loading your account settings" />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage(null);
    await updateSettingsMutation.mutateAsync(formState);
    queryClient.invalidateQueries({ queryKey: ['portal-dashboard'] });
  };

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Account settings</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950 dark:text-slate-50">Update your portal preferences</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-500 dark:text-slate-400">Profile and notification preferences are saved through the same API abstraction used by the rest of the portal.</p>
      </header>

      {updateSettingsMutation.isError ? <ErrorAlert message={getErrorMessage(updateSettingsMutation.error, 'We could not save your account settings.')} /> : null}
      {successMessage ? <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">{successMessage}</div> : null}

      <form className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]" onSubmit={handleSubmit}>
        <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Profile</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="displayName">Display name</label><input id="displayName" value={formState.displayName} onChange={(event) => setFormState((current) => ({ ...current, displayName: event.target.value }))} className={profileFieldClassName} required /></div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="email">Billing email</label><input id="email" type="email" value={formState.email} onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))} className={profileFieldClassName} required /></div>
            <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="company">Company</label><input id="company" value={formState.company} onChange={(event) => setFormState((current) => ({ ...current, company: event.target.value }))} className={profileFieldClassName} required /></div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-panel">
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-50">Preferences</h2>
          <div className="mt-6 space-y-5">
            <div><label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="timezone">Timezone</label><select id="timezone" value={formState.timezone} onChange={(event) => setFormState((current) => ({ ...current, timezone: event.target.value }))} className={preferenceFieldClassName}><option value="America/Chicago">America/Chicago</option><option value="America/New_York">America/New_York</option><option value="Europe/London">Europe/London</option><option value="Asia/Singapore">Asia/Singapore</option></select></div>
            <label className={clsx('flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-400')} htmlFor="notificationsEnabled"><input id="notificationsEnabled" type="checkbox" checked={formState.notificationsEnabled} onChange={(event) => setFormState((current) => ({ ...current, notificationsEnabled: event.target.checked }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600" /><span><span className="block font-medium text-slate-900 dark:text-slate-100">Billing and renewal notifications</span>Keep email reminders enabled for renewals, seat changes, and payment issues.</span></label>
          </div>
          <button type="submit" disabled={updateSettingsMutation.isPending} className="mt-6 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">{updateSettingsMutation.isPending ? 'Saving…' : 'Save settings'}</button>
        </section>
      </form>
    </section>
  );
}
