'use client';

import { signOut, useSession } from 'next-auth/react';
import { SidebarNav } from '@/components/sidebar-nav';
import { usePortalShellStore } from '@/lib/store';

export function PortalShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const { data: session } = useSession();
  const sidebarOpen = usePortalShellStore((state) => state.sidebarOpen);
  const toggleSidebar = usePortalShellStore((state) => state.toggleSidebar);
  const userName = session?.user?.name ?? 'Customer';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-4 lg:flex-row lg:px-6">
        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-panel lg:w-72 lg:flex-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">FastSaaS</p>
              <h1 className="mt-2 text-lg font-semibold">Customer Portal</h1>
            </div>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 lg:hidden"
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
          <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-slate-500">Signed in as</p>
              <h2 className="text-xl font-semibold">{userName}</h2>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/sign-in' })}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700"
            >
              Sign out
            </button>
          </header>

          <main className="flex-1" role="main">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
