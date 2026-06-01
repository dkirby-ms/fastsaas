import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDefaultPortalRoute, hasPublisherAccess } from '@/lib/roles';

export async function requirePublisherAccess() {
  const session = await auth();

  if (!session) {
    redirect('/sign-in');
  }

  if (!hasPublisherAccess(session.roles)) {
    redirect(getDefaultPortalRoute(session.roles));
  }

  return session;
}

export async function requireCustomerAccess() {
  const session = await auth();

  if (!session) {
    redirect('/sign-in');
  }

  if (hasPublisherAccess(session.roles)) {
    redirect('/publisher');
  }

  return session;
}
