import { ProductAssetsClient } from '@/components/publisher/ProductAssetsClient';

export default async function PublisherProductAssetsPage({ params }: Readonly<{ params: Promise<{ productId: string }> }>) {
  const { productId } = await params;
  return <ProductAssetsClient productId={productId} />;
}
