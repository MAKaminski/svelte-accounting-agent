import { handle } from '$lib/server/api';
import { selectOrg } from '$lib/server/processes/members';
export const POST = handle(({ event }) => {
  const org = selectOrg(event.locals.identity!, event.params.id!);
  event.cookies.set('books_org', org.id, { path: '/', httpOnly: true, sameSite: 'lax', secure: event.url.protocol === 'https:', maxAge: 365 * 86400 });
  return org;
});
