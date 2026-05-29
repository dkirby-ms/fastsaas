'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const navigation = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/plan', label: 'Plan' },
  { href: '/settings', label: 'Settings' },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Customer portal navigation" className="space-y-2">
      {navigation.map((item) => {
        const isActive = pathname === item.href;
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
