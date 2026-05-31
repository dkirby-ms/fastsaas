import { requirePublisherAccess } from '@/lib/route-access';

export default async function PublisherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePublisherAccess();
  return children;
}
