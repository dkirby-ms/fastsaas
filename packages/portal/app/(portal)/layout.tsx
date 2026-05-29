import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { PortalShell } from '@/components/portal-shell';
import { authOptions } from '@/lib/auth';

export default async function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/sign-in');
  }

  return <PortalShell>{children}</PortalShell>;
}
