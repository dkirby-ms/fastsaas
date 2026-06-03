import { ProductAudiencesClient } from '@/components/publisher/ProductAudiencesClient';

export default async function PublisherProductAudiencesPage({ params }: Readonly<{ params: Promise<{ productId: string }> }>) {
  const { productId } = await params;
  return <ProductAudiencesClient productId={productId} />;
}
