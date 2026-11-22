// Google sign-in (Auth.js). Open sign-up or invite-only (SIGNUP_MODE): the signIn callback is MW.auth.signin (src/lib/server/identity.ts).
// JWT session cookie; the app resolves the email to a user, company and role on every request (hooks.server.ts).
import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/sveltekit/providers/google';
import { env } from '$lib/server/env';
import { signIn as allowSignIn } from '$lib/server/identity';

export const { handle, signIn, signOut } = SvelteKitAuth({
  // prompt=select_account: always show Google's account chooser (people with several Google accounts pick one).
  providers: env('AUTH_GOOGLE_ID') ? [Google({ clientId: env('AUTH_GOOGLE_ID'), clientSecret: env('AUTH_GOOGLE_SECRET'), authorization: { params: { prompt: 'select_account' } } })] : [],
  secret: env('AUTH_SECRET') || (env('NODE_ENV') === 'production' ? undefined : 'dev-only-auth-secret'),
  trustHost: true,
  basePath: '/auth',
  session: { strategy: 'jwt', maxAge: 30 * 86400 },
  pages: { signIn: '/login', error: '/login' },
  callbacks: {
    async signIn({ user, profile }) {
      return allowSignIn({
        email: user.email, name: user.name, sub: (profile?.sub as string | undefined) ?? null,
        emailVerified: (profile as { email_verified?: boolean } | undefined)?.email_verified
      });
    }
  }
});
