'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import clsx from 'clsx';
import { hasOperatorAccess } from '@/lib/roles';

const customerNavigation = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/webhooks', label: 'Webhooks' },
  { href: '/settings', label: 'Settings' },
];

const operatorNavigation = [
  { href: '/operator', label: 'Overview' },
  { href: '/operator/plans', label: 'Plans' },
  { href: '/operator/tenants', label: 'Tenants' },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isOperator = hasOperatorAccess(session?.roles);
  const isOperatorArea = pathname.startsWith('/operator');
  const navigation = isOperatorArea ? operatorNavigation : customerNavigation;
  const navLabel = isOperatorArea ? 'Operator' : 'Customer';

  return (
    <div className="space-y-4">
      <nav aria-label={`${navLabel} portal navigation`} className="space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'block rounded-2xl px-4 py-3 text-sm font-medium transition',
                isActive
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20 dark:bg-brand-500 dark:shadow-brand-500/20'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {isOperator && (
        <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
            Switch portal
          </p>
          {isOperatorArea ? (
            <Link
              href="/dashboard"
              className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
            >
              Customer Portal
            </Link>
          ) : (
            <Link
              href="/operator"
              className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
            >
              Operator Portal
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
