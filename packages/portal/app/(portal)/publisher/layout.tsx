import { PublisherIntegrationBanner } from '@/components/publisher-integration-banner';
import { requirePublisherAccess } from '@/lib/route-access';

export default async function PublisherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requirePublisherAccess();

  return (
    <div className="space-y-6">
      <PublisherIntegrationBanner />
      {children}
    </div>
  );
}
