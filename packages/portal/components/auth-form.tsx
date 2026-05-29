'use client';

import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/error-alert';

export function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = useState('alex.customer@fastsaas.dev');
  const [password, setPassword] = useState('demo-password');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl: '/dashboard',
    });

    setIsSubmitting(false);

    if (result?.error) {
      setErrorMessage('We could not sign you in. Check your details and try again.');
      return;
    }

    router.push(result?.url ?? '/dashboard');
    router.refresh();
  };

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
