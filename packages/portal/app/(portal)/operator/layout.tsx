import { requireOperatorAccess } from '@/lib/route-access';

export default async function OperatorLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireOperatorAccess();

  return (
    <div className="space-y-6">
      {children}
    </div>
  );
}
