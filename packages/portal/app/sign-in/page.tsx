import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AuthForm } from '@/components/auth-form';
import { getSingleSearchParam, sanitizeCallbackUrl } from '@/lib/auth-redirect';
import { getDefaultPortalRoute } from '@/lib/roles';

type SignInPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = searchParams ? await searchParams : {};
  const callbackUrl = sanitizeCallbackUrl(getSingleSearchParam(params.callbackUrl));
  const autoSignIn = getSingleSearchParam(params.autoSignIn) === '1';
  const session = await auth();

  if (session) {
    redirect(callbackUrl === '/dashboard' ? getDefaultPortalRoute(session.roles) : callbackUrl);
  }

  return (
    <main className="shell-gradient flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">FastSaaS Portal</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950 dark:text-slate-50">Sign in to manage subscriptions</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Sign in with Microsoft Entra to open the customer or publisher experience and call the FastSaaS API with the same bearer-token model enforced by the backend.</p>
        <AuthForm callbackUrl={callbackUrl} autoSignIn={autoSignIn} />
      </section>
    </main>
  );
}
