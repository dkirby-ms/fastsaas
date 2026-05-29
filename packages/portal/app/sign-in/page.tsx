import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth-form';
import { authOptions } from '@/lib/auth';

export default async function SignInPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect('/dashboard');
  }

  return (
    <main className="shell-gradient flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-panel">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">FastSaaS Portal</p>
        <h1 className="mt-4 text-3xl font-semibold text-slate-950">Sign in to manage your subscription</h1>
        <p className="mt-3 text-sm text-slate-600">
          This MVP uses a demo sign-in backed by NextAuth credentials. Swap the provider for Azure AD B2C when the identity tenant is available.
        </p>
        <AuthForm />
      </section>
    </main>
  );
}
