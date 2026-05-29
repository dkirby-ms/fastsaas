import type { NextAuthOptions } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import AzureADProvider from 'next-auth/providers/azure-ad';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for portal authentication`);
  }

  return value;
}

const azureTenantId = requireEnv('AZURE_AD_TENANT_ID');
const azureClientId = requireEnv('AZURE_AD_CLIENT_ID');
const azureClientSecret = requireEnv('AZURE_AD_CLIENT_SECRET');
const apiClientId = requireEnv('AZURE_AD_API_CLIENT_ID');
const apiScope = process.env.AZURE_AD_API_SCOPE?.trim() || `api://${apiClientId}/.default`;

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }

  try {
    const response = await fetch(`https://login.microsoftonline.com/${azureTenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: azureClientId,
        client_secret: azureClientSecret,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        scope: typeof token.scope === 'string' && token.scope.length > 0 ? token.scope : apiScope,
      }),
    });

    const refreshedTokens = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !refreshedTokens.access_token || !refreshedTokens.expires_in) {
      throw new Error(refreshedTokens.error_description ?? refreshedTokens.error ?? 'Failed to refresh access token');
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      scope: refreshedTokens.scope ?? token.scope,
      error: undefined,
    };
  } catch {
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

export const authOptions: NextAuthOptions = {
  secret: requireEnv('NEXTAUTH_SECRET'),
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/sign-in',
  },
  providers: [
    AzureADProvider({
      tenantId: azureTenantId,
      clientId: azureClientId,
      clientSecret: azureClientSecret,
      authorization: {
        params: {
          scope: ['openid', 'profile', 'email', 'offline_access', apiScope].join(' '),
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          accessTokenExpires: account.expires_at ? account.expires_at * 1000 : Date.now() + 55 * 60 * 1000,
          refreshToken: account.refresh_token,
          scope: account.scope ?? apiScope,
          tenantId:
            typeof (profile as Record<string, unknown> | undefined)?.tid === 'string'
              ? ((profile as Record<string, unknown>).tid as string)
              : token.tenantId,
          error: undefined,
        };
      }

      if (typeof token.accessTokenExpires === 'number' && Date.now() < token.accessTokenExpires - 60_000) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = typeof token.name === 'string' ? token.name : session.user.name;
        session.user.email = typeof token.email === 'string' ? token.email : session.user.email;
      }

      session.accessToken = typeof token.accessToken === 'string' ? token.accessToken : undefined;
      session.error = typeof token.error === 'string' ? token.error : undefined;
      session.tenantId = typeof token.tenantId === 'string' ? token.tenantId : undefined;

      return session;
    },
  },
};
