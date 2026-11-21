import { signIn } from '../../auth';
import { signupOpen } from '$lib/server/identity';
import type { Actions } from './$types';

// Auth.js redirects back here with ?error=AccessDenied when MW.auth.signin refuses the account.
export const load = ({ url }) => ({
  error: url.searchParams.get('error'),
  next: url.searchParams.get('next') ?? '/queue',
  signupOpen: signupOpen()
});
export const actions: Actions = { default: signIn };
