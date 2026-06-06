'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { PublisherMarketplacePlansClient } from '@/components/publisher-marketplace-plans-client';
import { PublisherPlansClient } from '@/components/publisher-plans-client';

type PlansTab = 'publisher-plans' | 'marketplace-plans';

const tabs: Array<{ id: PlansTab; label: string }> = [
  { id: 'publisher-plans', label: 'Publisher Plans' },
  { id: 'marketplace-plans', label: 'Marketplace Plans' },
];

export function PublisherPlansTabsClient() {
  const [activeTab, setActiveTab] = useState<PlansTab>('publisher-plans');

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-2 shadow-panel dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Publisher plans views">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'rounded-full px-4 py-2 text-sm font-semibold transition',
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-brand-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-brand-300',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div role="tabpanel">
        {activeTab === 'publisher-plans' ? <PublisherPlansClient /> : <PublisherMarketplacePlansClient />}
      </div>
    </section>
  );
}
