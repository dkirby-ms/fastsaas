import Link from 'next/link';

export function ForbiddenState({
  title = 'You do not have access to this workflow.',
  message,
  href = '/',
  cta = 'Return to portal home',
}: Readonly<{ title?: string; message: string; href?: string; cta?: string }>) {
  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-8 shadow-panel">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">403</p>
      <h1 className="mt-3 text-2xl font-semibold text-slate-950">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm text-slate-600">{message}</p>
      <Link
        href={href}
        className="mt-6 inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        {cta}
      </Link>
    </section>
  );
}
