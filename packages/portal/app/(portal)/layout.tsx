import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { PortalShell } from '@/components/portal-shell';

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  if (!session) {
    redirect('/sign-in');
  }

  return <PortalShell>{children}</PortalShell>;
}
