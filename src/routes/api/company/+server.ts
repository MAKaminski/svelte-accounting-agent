import { handle, str } from '$lib/server/api';
import { showCompany, updateCompany } from '$lib/server/processes/company';
export const GET = handle(() => showCompany());
export const POST = handle(({ body }) => updateCompany({ name: str(body.name), business: typeof body.business === 'string' ? body.business : undefined, codingRules: typeof body.codingRules === 'string' ? body.codingRules : undefined }));
