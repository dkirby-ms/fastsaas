import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LandingClient } from '@/components/landing-client';
import { buildLandingPath, getSingleSearchParam, sanitizeCallbackUrl } from '@/lib/auth-redirect';
import { getDefaultPortalRoute, hasOperatorAccess } from '@/lib/roles';

type LandingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const params = searchParams ? await searchParams : {};
  const token = getSingleSearchParam(params.token);
  const subscriptionId = getSingleSearchParam(params.subscriptionId);
  const session = await auth();

  if (!session && token) {
    const callbackUrl = buildLandingPath(token, subscriptionId);
    const query = new URLSearchParams({
      callbackUrl: sanitizeCallbackUrl(callbackUrl),
      autoSignIn: '1',
    });

    redirect(`/sign-in?${query.toString()}`);
  }

  if (session && hasOperatorAccess(session.roles)) {
    redirect(getDefaultPortalRoute(session.roles));
  }

  return <LandingClient token={token} initialSubscriptionId={subscriptionId} />;
}
