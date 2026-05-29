'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import type { SettingsData } from '@fastsaas/shared';
import { ErrorAlert } from '@/components/error-alert';
import { LoadingPanel } from '@/components/loading-panel';
import { ApiError, portalApi } from '@/lib/api-client';

const emptySettings: SettingsData = {
  displayName: '',
  email: '',
  company: '',
  timezone: 'America/Chicago',
  notificationsEnabled: true,
};

export function SettingsClient() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['portal-settings'],
    queryFn: portalApi.getSettings,
  });
  const [formState, setFormState] = useState<SettingsData>(emptySettings);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settingsQuery.data) {
      setFormState(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const updateSettingsMutation = useMutation({
    mutationFn: portalApi.updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['portal-settings'], data);
      setSuccessMessage('Your settings were saved.');
    },
  });

  if (settingsQuery.isLoading) {
    return <LoadingPanel label="Loading your account settings" />;
  }

  if (settingsQuery.isError) {
    return <ErrorAlert message={(settingsQuery.error as ApiError).userMessage} />;
  }

  if (!settingsQuery.data) {
    return <LoadingPanel label="Loading your account settings" />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage(null);
    await updateSettingsMutation.mutateAsync(formState);
    queryClient.invalidateQueries({ queryKey: ['portal-dashboard'] });
  };

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Account settings</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">Update your portal preferences</h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-500">Profile and notification preferences are saved through the same API abstraction used by the rest of the portal.</p>
      </header>

      {updateSettingsMutation.isError ? <ErrorAlert message={(updateSettingsMutation.error as ApiError).userMessage} /> : null}
      {successMessage ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{successMessage}</div> : null}

      <form className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]" onSubmit={handleSubmit}>
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
          <h2 className="text-xl font-semibold text-slate-950">Profile</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="displayName">
                Display name
              </label>
              <input
                id="displayName"
                value={formState.displayName}
                onChange={(event) => setFormState((current) => ({ ...current, displayName: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="email">
                Billing email
              </label>
              <input
                id="email"
                type="email"
                value={formState.email}
                onChange={(event) => setFormState((current) => ({ ...current, email: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                required
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="company">
                Company
              </label>
              <input
                id="company"
                value={formState.company}
                onChange={(event) => setFormState((current) => ({ ...current, company: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                required
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
          <h2 className="text-xl font-semibold text-slate-950">Preferences</h2>
          <div className="mt-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="timezone">
                Timezone
              </label>
              <select
                id="timezone"
                value={formState.timezone}
                onChange={(event) => setFormState((current) => ({ ...current, timezone: event.target.value }))}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
              </select>
            </div>
            <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600" htmlFor="notificationsEnabled">
              <input
                id="notificationsEnabled"
                type="checkbox"
                checked={formState.notificationsEnabled}
                onChange={(event) => setFormState((current) => ({ ...current, notificationsEnabled: event.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span>
                <span className="block font-medium text-slate-900">Billing and renewal notifications</span>
                Keep email reminders enabled for renewals, seat changes, and payment issues.
              </span>
            </label>
          </div>
          <button
            type="submit"
            disabled={updateSettingsMutation.isPending}
            className="mt-6 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {updateSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </section>
      </form>
    </section>
  );
}
