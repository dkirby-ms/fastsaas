import { PublisherTenantDetailClient } from '@/components/publisher-tenant-detail-client';

export default async function PublisherTenantDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <PublisherTenantDetailClient tenantId={id} />;
}
