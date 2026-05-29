import NextAuth from 'next-auth';
import type { NextAuthConfig, NextAuthResult } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for portal authentication`);
  }

  return value;
}

type AuthEnv = {
  tenantId: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  apiScope: string;
  secret: string;
};

function getAuthEnv(): AuthEnv {
  const tenantId = requireEnv('AZURE_AD_TENANT_ID');
  const clientId = requireEnv('AZURE_AD_CLIENT_ID');
  const clientSecret = requireEnv('AZURE_AD_CLIENT_SECRET');
  const apiClientId = requireEnv('AZURE_AD_API_CLIENT_ID');

  return {
    tenantId,
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    clientId,
    clientSecret,
    apiScope: process.env.AZURE_AD_API_SCOPE?.trim() || `api://${apiClientId}/.default`,
    secret: requireEnv('NEXTAUTH_SECRET'),
  };
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }

  const env = getAuthEnv();

  try {
    const response = await fetch(`https://login.microsoftonline.com/${env.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: env.clientId,
        client_secret: env.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        scope: typeof token.scope === 'string' && token.scope.length > 0 ? token.scope : env.apiScope,
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

function createAuthConfig(): NextAuthConfig {
  const env = getAuthEnv();

  return {
    secret: env.secret,
    session: {
      strategy: 'jwt',
    },
    pages: {
      signIn: '/sign-in',
    },
    providers: [
      MicrosoftEntraID({
        issuer: env.issuer,
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        authorization: {
          params: {
            scope: ['openid', 'profile', 'email', 'offline_access', env.apiScope].join(' '),
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
            scope: account.scope ?? env.apiScope,
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
  } satisfies NextAuthConfig;
}

const nextAuth = NextAuth(createAuthConfig) as NextAuthResult;

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;
