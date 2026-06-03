'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import clsx from 'clsx';
import { getPortalRole } from '@/lib/roles';

const customerNavigation = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/plan', label: 'Plan' },
  { href: '/settings', label: 'Settings' },
];

const publisherNavigation = [
  { href: '/publisher', label: 'Overview' },
  { href: '/publisher/products', label: 'Products' },
  { href: '/publisher/plans', label: 'Plans' },
  { href: '/publisher/tenants', label: 'Tenants' },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const portalRole = getPortalRole(session?.roles);
  const navigation = portalRole === 'publisher' ? publisherNavigation : customerNavigation;

  return (
    <nav aria-label={`${portalRole === 'publisher' ? 'Publisher' : 'Customer'} portal navigation`} className="space-y-2">
      {navigation.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'block rounded-2xl px-4 py-3 text-sm font-medium transition',
              isActive ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
