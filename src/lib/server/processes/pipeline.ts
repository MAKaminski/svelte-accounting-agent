// Use case "Routine expense": research → recommend for one entry. Failures leave the entry `invalid`
// with a source-tagged reason; manual coding still works.
import { researchEntry } from './research';
import { recommendEntry } from './recommend';

export async function researchAndRecommend(entryId: string, opts: { force?: boolean } = {}) {
  await researchEntry(entryId);
  try {
    return await recommendEntry(entryId, opts);
  } catch {
    return null; // state already set to invalid by recommendEntry
  }
}
