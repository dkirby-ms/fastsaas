'use client';

import { useQuery } from '@tanstack/react-query';
import { AudienceList } from '@/components/publisher/AudienceList';
import { ErrorAlert } from '@/components/error-alert';
import { ForbiddenState } from '@/components/forbidden-state';
import { LoadingPanel } from '@/components/loading-panel';
import { portalApi } from '@/lib/api-client';
import { getErrorMessage, isApiErrorStatus } from '@/lib/errors';

interface ProductAudiencesClientProps {
  productId: string;
}

export function ProductAudiencesClient({ productId }: ProductAudiencesClientProps) {
  const audiencesQuery = useQuery({ queryKey: ['publisher-product-audiences', productId], queryFn: () => portalApi.getPublisherProductAudiences(productId) });

  if (audiencesQuery.isLoading) return <LoadingPanel label="Loading marketplace audiences" />;
  if (audiencesQuery.isError) {
    if (isApiErrorStatus(audiencesQuery.error, 403)) {
      return <ForbiddenState message={getErrorMessage(audiencesQuery.error, 'This account does not have publisher access.')} href="/dashboard" cta="Open customer portal" />;
    }

    return <ErrorAlert message={getErrorMessage(audiencesQuery.error, 'We could not load audience visibility.')} />;
  }
  if (!audiencesQuery.data) return <LoadingPanel label="Loading marketplace audiences" />;

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Audiences</p>
        <h2 className="mt-3 text-2xl font-semibold text-slate-950">Preview and private visibility</h2>
        <p className="mt-3 max-w-3xl text-sm text-slate-500">Track which preview programs and private segments are currently available for the selected listing.</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-2">
        <AudienceList title="Preview audiences" description="Users and programs that can review the listing before general availability." audiences={audiencesQuery.data.preview} emptyMessage="No preview audiences configured." />
        <AudienceList title="Private audiences" description="Private marketplace segments and eligibility groups synced from Partner Center." audiences={audiencesQuery.data.private} emptyMessage="No private audiences configured." />
      </div>
    </section>
  );
}
