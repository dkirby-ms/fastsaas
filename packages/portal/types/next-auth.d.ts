import type { DefaultSession } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: 'RefreshAccessTokenError';
    tenantId?: string;
    roles?: string[];
    user?: DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    accessToken?: string;
    accessTokenExpires?: number;
    refreshToken?: string;
    scope?: string;
    tenantId?: string;
    roles?: string[];
    error?: 'RefreshAccessTokenError';
  }
}
