import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out-button';

const defaultMarketplaceOfferUrl =
  'https://marketplace.microsoft.com/en-us/product/kirbytoso.fastsaas0-preview?tab=DetailsAndSupport&flightCodes=d8933a03-d000-4ae7-9b68-4c3a475b30da';

export default function NoSubscriptionPage() {
  const marketplaceOfferUrl = process.env.NEXT_PUBLIC_MARKETPLACE_OFFER_URL?.trim() || defaultMarketplaceOfferUrl;

  return (
    <main className="shell-gradient flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-panel dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">
          FastSaaS Portal
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950 dark:text-slate-50">
          No Active Subscription
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Your organization does not have an active subscription to this service.
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Purchase or reactivate a subscription in Azure Marketplace, then sign in again to continue.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={marketplaceOfferUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Open Azure Marketplace Offer
          </Link>
          <SignOutButton />
        </div>
      </section>
    </main>
  );
}
