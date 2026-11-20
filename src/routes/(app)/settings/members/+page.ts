import { call } from '$lib/client';
import type { Member, ApiToken } from '$lib/types';

export const load = async ({ fetch, depends }) => {
  depends('app:members');
  try {
    const [members, tokens] = await Promise.all([call<Member[]>('members.list', {}, fetch), call<ApiToken[]>('tokens.list', {}, fetch)]);
    return { members, tokens, error: null as string | null };
  } catch (e) {
    return { members: [] as Member[], tokens: [] as ApiToken[], error: (e as Error).message };
  }
};
