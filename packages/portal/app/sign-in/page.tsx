import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { AuthForm } from '@/components/auth-form';

export default async function SignInPage() {
  const session = await auth();

  if (session) {
    redirect('/dashboard');
  }

  return (
    <main className="shell-gradient flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">FastSaaS Portal</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950">Sign in to manage your subscription</h1>
        <p className="mt-3 text-sm text-slate-600">
          Sign in with Microsoft Entra to open the portal and call the FastSaaS API with the same bearer-token model enforced by the backend.
        </p>
        <AuthForm />
      </section>
    </main>
  );
}
