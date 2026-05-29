export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 shadow-panel" role="status" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" aria-hidden="true" />
        <p className="mt-4 text-sm font-medium text-slate-600">{label}</p>
      </div>
    </div>
  );
}
