'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <main className="max-w-lg rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-100">Portal error</p>
          <h1 className="mt-4 text-3xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-sm text-slate-200">{error.message || 'Try again in a moment. If the issue persists, contact support.'}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 rounded-full bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            Retry
          </button>
        </main>
      </body>
    </html>
  );
}
