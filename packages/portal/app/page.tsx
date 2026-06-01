import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getDefaultPortalRoute } from '@/lib/roles';

export default async function HomePage() {
  const session = await auth();
  redirect(session ? getDefaultPortalRoute(session.roles) : '/sign-in');
}
