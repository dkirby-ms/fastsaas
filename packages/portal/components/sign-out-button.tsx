'use client';

import clsx from 'clsx';
import { signOut } from 'next-auth/react';

const defaultClassName =
  'rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-500 hover:text-brand-700 dark:border-slate-600 dark:text-slate-200 dark:hover:border-brand-400 dark:hover:text-brand-300';

type SignOutButtonProps = {
  className?: string;
  label?: string;
};

export function SignOutButton({ className, label = 'Sign out' }: SignOutButtonProps) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/sign-in' })}
      className={clsx(defaultClassName, className)}
    >
      {label}
    </button>
  );
}
