export function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300" role="alert" aria-live="assertive">
      {message}
    </div>
  );
}
