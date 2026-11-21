<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { call, money } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  let { data } = $props();
  let answers = $state<Record<string, string>>({});
  let busy = $state<string | null>(null);
  const open = $derived(data.questions.filter((q) => q.status === 'open'));
  const answered = $derived(data.questions.filter((q) => q.status === 'answered'));

  async function answer(id: string, form?: HTMLFormElement) {
    // Read the field itself so input typed before hydration still counts.
    const text = ((form?.elements.namedItem('answer') as HTMLInputElement | null)?.value ?? answers[id] ?? '').trim();
    if (!text) return;
    busy = id;
    try { await call('question.answer', { id, text }); ui.toast('Answered — the entry is being re-recommended'); await invalidateAll(); }
    catch (e) { ui.toast((e as Error).message, { kind: 'error' }); }
    finally { busy = null; }
  }
  const useGuess = (id: string, guess: string | null) => { if (guess) answers[id] = `Yes — ${guess}`; };
</script>
<svelte:head><title>Questions · Accounting Agent</title></svelte:head>
<header class="page-head"><div><h1>Questions for the owner</h1><p class="sub">When the agent can't tell, it asks one plain question. Your answer codes the entry and is kept as evidence.</p></div></header>
{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else}
  {#if !open.length}
    <div class="card empty-state"><span class="ring ok" aria-hidden="true">✓</span><p class="big">No open questions.</p><p class="muted">{answered.length} answered so far. Questions appear when the agent is not sure.</p></div>
  {/if}
  {#each open as q (q.id)}
    <form class="card q" onsubmit={(e) => { e.preventDefault(); answer(q.id, e.currentTarget); }}>
      <div class="meta"><a href="/entry/{q.entryId}">{q.merchant}</a><span class="mono">{money(q.amountCents)}</span><span class="muted">{q.createdAt.slice(0, 10)}</span></div>
      <p class="text">{q.text}</p>
      <div class="row">
        <label class="sr-only" for="a-{q.id}">Answer</label>
        <input id="a-{q.id}" name="answer" bind:value={answers[q.id]} placeholder="Answer in plain words, then Enter" />
        {#if q.bestGuess}<button class="btn" type="button" onclick={() => useGuess(q.id, q.bestGuess)}>Best guess is right</button>{/if}
        <button class="btn primary" type="submit" disabled={busy === q.id}>Answer <span class="kbd">Enter</span></button>
      </div>
    </form>
  {/each}
  {#if answered.length}
    <h2 class="section-title">Answered</h2>
    <div class="card list">
      {#each answered as q}<div class="done"><a href="/entry/{q.entryId}">{q.merchant}</a><span class="muted">{q.text}</span><span>→ {q.answer}</span></div>{/each}
    </div>
  {/if}
{/if}
<style>
  .q { padding: 20px 22px; display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; border-left: 2px solid var(--warn); }
  .meta { display: flex; gap: 14px; align-items: baseline; flex-wrap: wrap; font-size: 13px; } .meta a { font-weight: 500; color: var(--text); }
  .text { margin: 0; font-size: 16px; line-height: 1.5; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; } .row input { flex: 1 1 260px; height: 36px; padding: 0 12px; }
  .list { padding: 6px 20px; } .done { display: grid; grid-template-columns: 180px 1fr 1fr; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--hair-soft); font-size: 13px; } .done:last-child { border-bottom: 0; }
</style>
