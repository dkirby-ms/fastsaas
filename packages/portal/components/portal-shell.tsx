'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { SidebarNav } from '@/components/sidebar-nav';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { usePortalShellStore } from '@/lib/store';

export function PortalShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const sidebarOpen = usePortalShellStore((state) => state.sidebarOpen);
  const toggleSidebar = usePortalShellStore((state) => state.toggleSidebar);
  const userName = session?.user?.name ?? 'Customer';
  const isOperatorArea = pathname.startsWith('/operator');
  const portalTitle = isOperatorArea ? 'Operator Portal' : 'Customer Portal';
  const portalSubtitle = isOperatorArea ? 'SaaS operations' : 'Customer self-service';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-4 lg:flex-row lg:px-6">
        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-panel dark:border-slate-700 dark:bg-slate-900 lg:w-72 lg:flex-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-300">FastSaaS</p>
              <h1 className="mt-2 text-lg font-semibold">{portalTitle}</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{portalSubtitle}</p>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300 lg:hidden"
              onClick={toggleSidebar}
              aria-expanded={sidebarOpen}
              aria-controls="portal-navigation"
            >
              Menu
            </button>
          </div>
          <div id="portal-navigation" className={sidebarOpen ? 'mt-6 block' : 'mt-6 hidden lg:block'}>
            <SidebarNav />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-panel dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Signed in as</p>
              <h2 className="text-xl font-semibold">{userName}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <ThemeToggle />
              <SignOutButton />
            </div>
          </header>

          <main className="flex-1" role="main">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
