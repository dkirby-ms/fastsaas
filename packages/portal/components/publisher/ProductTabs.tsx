'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import type { PublisherProductDetail } from '@/lib/publisher/types';

interface ProductTabsProps {
  product: PublisherProductDetail;
}

export function ProductTabs({ product }: ProductTabsProps) {
  const pathname = usePathname();
  const pricingTabs = product.plans.map((plan) => ({
    href: `/publisher/products/${product.id}/plans/${plan.id}/pricing`,
    label: `Pricing · ${plan.externalPlanId}`,
  }));
  const tabs = [
    { href: `/publisher/products/${product.id}/assets`, label: 'Assets' },
    { href: `/publisher/products/${product.id}/audiences`, label: 'Audiences' },
    ...pricingTabs,
  ];

  return (
    <nav aria-label="Product detail navigation" className="flex flex-wrap gap-3">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              'rounded-full border px-4 py-2 text-sm font-semibold transition',
              isActive
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500 hover:text-brand-700'
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
