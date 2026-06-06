import { auth } from '@/auth';
import { getDefaultPortalRoute, hasPublisherAccess } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function AuthDebugPage() {
  if (process.env.AUTH_DEBUG !== 'true') {
    return <p>Auth debugging disabled.</p>;
  }

  const session = await auth();

  if (!session) {
    return <p>No active session. Please sign in.</p>;
  }

  const publisherAccess = hasPublisherAccess(session.roles);
  const defaultRoute = getDefaultPortalRoute(session.roles);

  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem' }}>
      <h1>Auth Debug</h1>

      <section>
        <h2>User</h2>
        <pre>{JSON.stringify(session.user, null, 2)}</pre>
      </section>

      <section>
        <h2>Tenant ID</h2>
        <pre>{session.tenantId ?? '(none)'}</pre>
      </section>

      <section>
        <h2>Roles</h2>
        <pre>{JSON.stringify(session.roles, null, 2)}</pre>
      </section>

      <section>
        <h2>Publisher Access</h2>
        <pre>{String(publisherAccess)}</pre>
      </section>

      <section>
        <h2>Default Portal Route</h2>
        <pre>{defaultRoute}</pre>
      </section>

      {session.error && (
        <section>
          <h2>Auth Error</h2>
          <pre>{session.error}</pre>
        </section>
      )}
    </main>
  );
}
