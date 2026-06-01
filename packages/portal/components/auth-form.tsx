'use client';

import { signIn } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorAlert } from '@/components/error-alert';

export function AuthForm({ callbackUrl = '/dashboard', autoSignIn = false }: { callbackUrl?: string; autoSignIn?: boolean }) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoStarted = useRef(false);

  const handleSignIn = useCallback(async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await signIn('microsoft-entra-id', {
        redirect: false,
        callbackUrl,
      });

      setIsSubmitting(false);

      if (result?.error) {
        setErrorMessage('We could not redirect you to Microsoft Entra. Try again.');
        return;
      }

      if (result?.url) {
        window.location.assign(result.url);
        return;
      }

      window.location.assign(callbackUrl);
    } catch {
      setIsSubmitting(false);
      setErrorMessage('We could not redirect you to Microsoft Entra. Try again.');
    }
  }, [callbackUrl]);

  useEffect(() => {
    if (!autoSignIn || autoStarted.current) {
      return;
    }

    autoStarted.current = true;
    void handleSignIn();
  }, [autoSignIn, handleSignIn]);

  return (
    <div className="mt-8 space-y-5">
      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}
      <button
        type="button"
        onClick={() => void handleSignIn()}
        disabled={isSubmitting}
        className="w-full rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Redirecting…' : 'Continue with Microsoft Entra'}
      </button>
      <p className="text-sm text-slate-500">
        You will be redirected to your Microsoft Entra sign-in page and returned here with an access token for the FastSaaS API.
      </p>
    </div>
  );
}
