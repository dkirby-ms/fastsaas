import { PublisherProductLayoutClient } from '@/components/publisher/PublisherProductLayoutClient';

export default async function PublisherProductDetailLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ productId: string }>;
}>) {
  const { productId } = await params;

  return <PublisherProductLayoutClient productId={productId}>{children}</PublisherProductLayoutClient>;
}
