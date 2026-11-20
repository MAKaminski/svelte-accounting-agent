import { call } from '$lib/client';
import type { Entry, Question, MappingProposal, Whoami, Org } from '$lib/types';

export const load = async ({ fetch, depends }) => {
  depends('app:counts');
  try {
    const [me, orgs, entries, questions, mappings, settings] = await Promise.all([
      call<Whoami>('auth.whoami', {}, fetch),
      call<Org[]>('orgs.list', {}, fetch),
      call<Entry[]>('entries.list', {}, fetch),
      call<Question[]>('questions.list', { status: 'open' }, fetch),
      call<MappingProposal[]>('mappings.list', { status: 'proposed' }, fetch),
      call<{ slashMode: string; qboMode: string; modelMode: string; modelWorker: string; devBypass: boolean; lastPullAt: string | null }>('settings.show', {}, fetch)
    ]);
    const review = entries.filter((e) => ['recommended', 'invalid', 'asked', 'approved'].includes(e.state)).length;
    return { counts: { queue: review, questions: questions.length, rules: mappings.length }, settings, me, orgs };
  } catch {
    return { counts: { queue: 0, questions: 0, rules: 0 }, settings: null, me: null, orgs: [] as Org[] };
  }
};
