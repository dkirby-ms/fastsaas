import type { DashboardData } from '@fastsaas/shared';
import type { Session } from 'next-auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PortalShell } from '@/components/portal-shell';
import { hasPublisherAccess } from '@/lib/roles';
import { decodeMockSubscriptionGateCookie, mockSubscriptionGateCookieName } from '@/lib/subscription-gate-cookie';

function shouldUseMockApi() {
  return process.env.USE_MOCK_API?.toLowerCase() !== 'false' || !process.env.API_BASE_URL;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

async function hasCustomerSubscription(session: Session) {
  if (shouldUseMockApi()) {
    const cookieStore = await cookies();
    return decodeMockSubscriptionGateCookie(cookieStore.get(mockSubscriptionGateCookieName)?.value);
  }

  if (!session.accessToken || !process.env.API_BASE_URL) {
    throw new Error('Portal customer subscription checks require API_BASE_URL and a session access token.');
  }

  const response = await fetch(`${normalizeBaseUrl(process.env.API_BASE_URL)}/portal/dashboard`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to verify customer subscription access (${response.status}).`);
  }

  const dashboard = (await response.json()) as DashboardData;
  return dashboard.subscription !== null;
}

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  if (!session) {
    redirect('/sign-in');
  }

  if (!hasPublisherAccess(session.roles) && !(await hasCustomerSubscription(session))) {
    redirect('/no-subscription');
  }

  return <PortalShell>{children}</PortalShell>;
}
