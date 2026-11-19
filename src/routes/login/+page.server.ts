import { fail, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/env';
import { sessionToken } from '$lib/server/auth';
export const actions = {
  default: async ({ request, cookies, url }) => {
    const form = await request.formData();
    if (form.get('passcode') !== config.passcode) return fail(401, { error: 'Wrong passcode' });
    cookies.set('books_session', sessionToken(config.passcode), { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 30 * 86400 });
    redirect(303, url.searchParams.get('next') ?? '/queue');
  }
};
