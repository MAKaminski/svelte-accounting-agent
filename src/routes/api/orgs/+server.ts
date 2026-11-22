import { handle, str } from '$lib/server/api';
import { listOrgs } from '$lib/server/processes/members';
import { createCompany } from '$lib/server/processes/company';
import { AppError } from '$lib/server/util';
export const GET = handle(({ event }) => listOrgs(event.locals.identity!));
export const POST = handle(async ({ body, event }) => {
  if (event.locals.identity!.token) throw new AppError('forbidden', 'API tokens are pinned to one company; create companies in the web app', 403);
  const org = await createCompany(event.locals.identity!.userId, { name: str(body.name), business: str(body.business) });
  event.cookies.set('books_org', org.id, { path: '/', httpOnly: true, sameSite: 'lax', secure: event.url.protocol === 'https:', maxAge: 365 * 86400 });
  return { id: org.id, name: org.name, business: str(body.business) ?? '', codingRules: '', sampleData: false, setup: [] };
});
