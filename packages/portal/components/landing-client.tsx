'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LandingConfirmationCard } from '@/components/landing-confirmation-card';
import { buildLandingPath } from '@/lib/auth-redirect';
import { ApiError, portalApi } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';

function getExistingSubscriptionId(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) {
    return undefined;
  }

  const subscriptionId = error.details?.subscriptionId;
  return typeof subscriptionId === 'string' && subscriptionId.length > 0 ? subscriptionId : undefined;
}

export function LandingClient({ token, initialSubscriptionId }: { token?: string; initialSubscriptionId?: string }) {
  const router = useRouter();
  const [subscriptionId, setSubscriptionId] = useState(initialSubscriptionId);
  const [activateError, setActivateError] = useState<string | null>(null);

  const resolveQuery = useQuery({
    queryKey: ['marketplace-landing', token, subscriptionId],
    queryFn: async () => {
      if (!token) {
        throw new ApiError('Marketplace token is required', 400, 'MARKETPLACE_TOKEN_REQUIRED', 'The Marketplace redirect is missing its token. Start again from Azure Marketplace.');
      }

      return subscriptionId
        ? portalApi.getSubscription(subscriptionId)
        : portalApi.createMarketplaceSubscription(token);
    },
    enabled: Boolean(token),
    retry: false,
  });

  useEffect(() => {
    if (!resolveQuery.isError || subscriptionId) {
      return;
    }

    const existingSubscriptionId = getExistingSubscriptionId(resolveQuery.error);
    if (existingSubscriptionId) {
      setSubscriptionId(existingSubscriptionId);
    }
  }, [resolveQuery.error, resolveQuery.isError, subscriptionId]);

  useEffect(() => {
    if (!token || !resolveQuery.data?.id || resolveQuery.data.id === subscriptionId) {
      return;
    }

    setSubscriptionId(resolveQuery.data.id);
    router.replace(buildLandingPath(token, resolveQuery.data.id));
  }, [resolveQuery.data?.id, router, subscriptionId, token]);

  const resolveError = useMemo(() => {
    if (!token) {
      return 'The Marketplace redirect is missing its token. Start again from Azure Marketplace.';
    }

    if (!resolveQuery.isError || getExistingSubscriptionId(resolveQuery.error)) {
      return null;
    }

    return getErrorMessage(resolveQuery.error, 'We could not resolve that Marketplace purchase.');
  }, [resolveQuery.error, resolveQuery.isError, token]);

  const activateMutation = useMutation({
    mutationFn: async () => {
      setActivateError(null);

      if (!resolveQuery.data?.id) {
        throw new ApiError('Subscription resolution is incomplete', 400, 'SUBSCRIPTION_NOT_READY', 'Resolve the Marketplace purchase before activation.');
      }

      return portalApi.activateSubscription(resolveQuery.data.id);
    },
    onSuccess: () => {
      router.push('/dashboard');
    },
    onError: async (error) => {
      setActivateError(getErrorMessage(error, 'We could not activate the subscription.'));

      if (error instanceof ApiError && error.status === 409) {
        const latest = await resolveQuery.refetch();
        if (latest.data?.status === 'Active') {
          router.push('/dashboard');
        }
      }
    },
  });

  return (
    <main className="shell-gradient min-h-screen px-6 py-12">
      <LandingConfirmationCard
        subscription={resolveQuery.data}
        isResolving={resolveQuery.isPending || (resolveQuery.isFetching && !resolveQuery.data)}
        isActivating={activateMutation.isPending}
        resolveError={resolveError}
        activateError={activateError}
        onRetryResolve={() => {
          setActivateError(null);
          void resolveQuery.refetch();
        }}
        onActivate={() => activateMutation.mutate()}
        onOpenDashboard={() => router.push('/dashboard')}
      />
    </main>
  );
}
