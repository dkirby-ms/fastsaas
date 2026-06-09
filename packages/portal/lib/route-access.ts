import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDefaultPortalRoute, hasOperatorAccess } from '@/lib/roles';

export async function requireOperatorAccess() {
  const session = await auth();

  if (!session) {
    redirect('/sign-in');
  }

  if (!hasOperatorAccess(session.roles)) {
    redirect(getDefaultPortalRoute(session.roles));
  }

  return session;
}

export async function requireCustomerAccess() {
  const session = await auth();

  if (!session) {
    redirect('/sign-in');
  }

  // Dual-role users (operator role + customer subscription) are allowed in
  // customer pages. The subscription gate in the portal layout handles
  // redirecting users who have no active subscription.

  return session;
}
