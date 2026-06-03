import type { BillingTerm, Market, PlanPricing } from '@fastsaas/shared';

interface PricingTableProps {
  pricing: PlanPricing;
}

function formatMoney(currency: string, amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}

function formatLifecycleState(value: string) {
  return value.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').trim();
}

function formatBillingTerm(term: BillingTerm) {
  if (term.durationUnit === 'one-time' || term.billingTermType === 'one-time') {
    return 'One-time purchase';
  }

  const unit = term.duration === 1 ? term.durationUnit : `${term.durationUnit}s`;
  return `${term.duration} ${unit} · ${term.billingTermType}`;
}

function availabilityTone(availability: Market['marketAvailability']) {
  switch (availability) {
    case 'available':
      return 'bg-emerald-100 text-emerald-700';
    case 'preview':
      return 'bg-sky-100 text-sky-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

export function PricingTable({ pricing }: PricingTableProps) {
  const billingTerms = pricing.billingTerms.map((term) => formatBillingTerm(term));

  if (pricing.markets.length === 0) {
    return <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">No pricing synced yet for this plan.</div>;
  }

  return (
    <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">{pricing.planName}</h2>
          <p className="mt-2 text-sm text-slate-500">Markets, billing terms, and lifecycle state synced from Partner Center.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">{formatLifecycleState(pricing.availability.lifecycleState)}</span>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${pricing.availability.availableForPurchase ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {pricing.availability.availableForPurchase ? 'Purchasable' : 'Not purchasable'}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {billingTerms.length > 0 ? (
          billingTerms.map((term) => (
            <span key={term} className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
              {term}
            </span>
          ))
        ) : (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">No billing terms synced</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="px-4 py-3 font-semibold">Market</th>
              <th className="px-4 py-3 font-semibold">Availability</th>
              <th className="px-4 py-3 font-semibold">Currency</th>
              <th className="px-4 py-3 font-semibold">Price</th>
              <th className="px-4 py-3 font-semibold">Billing terms</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pricing.markets.map((market) => (
              <tr key={`${market.region}-${market.currency}`}>
                <td className="px-4 py-4 font-medium text-slate-950">{market.region}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${availabilityTone(market.marketAvailability)}`}>
                    {market.marketAvailability}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-600">{market.currency}</td>
                <td className="px-4 py-4 text-slate-950">{formatMoney(market.currency, market.price)}</td>
                <td className="px-4 py-4 text-slate-600">{billingTerms.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
