import { OperatorTenantDetailClient } from '@/components/operator-tenant-detail-client';

export default async function OperatorTenantDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <OperatorTenantDetailClient tenantId={id} />;
}
