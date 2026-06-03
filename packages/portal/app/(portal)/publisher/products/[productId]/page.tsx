import { redirect } from 'next/navigation';

export default async function PublisherProductDetailPage({ params }: Readonly<{ params: Promise<{ productId: string }> }>) {
  const { productId } = await params;
  redirect(`/publisher/products/${productId}/assets`);
}
