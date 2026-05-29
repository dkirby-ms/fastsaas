import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

const demoUser = {
  id: 'cust_001',
  name: 'Alex Customer',
  email: 'alex.customer@fastsaas.dev',
};

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? 'dev-only-secret-change-me',
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/sign-in',
  },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Demo sign in',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        return {
          ...demoUser,
          email: credentials.email,
          name: credentials.email === demoUser.email ? demoUser.name : credentials.email.split('@')[0],
        };
      },
    }),
    // TODO: Replace credentials auth with Azure AD B2C once tenant details are provisioned.
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name;
        session.user.email = token.email;
      }

      return session;
    },
  },
};
