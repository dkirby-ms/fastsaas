import Link from 'next/link';

export function ForbiddenState({
  title = 'You do not have access to this workflow.',
  message,
  href = '/',
  cta = 'Return to portal home',
}: Readonly<{ title?: string; message: string; href?: string; cta?: string }>) {
  return (
    <section className="rounded-3xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-6 py-8 shadow-panel">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700 dark:text-amber-300">403</p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-slate-50">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{message}</p>
      <Link
        href={href}
        className="mt-6 inline-flex rounded-full bg-slate-950 dark:bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        {cta}
      </Link>
    </section>
  );
}
