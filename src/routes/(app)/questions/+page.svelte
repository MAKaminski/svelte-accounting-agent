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
<svelte:head><title>Questions · LaceLuxx Books</title></svelte:head>
<h1>Questions for the owner</h1>
{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else}
  {#if !open.length}
    <div class="card empty"><p class="big">No open questions.</p><p class="muted">{answered.length} answered so far. Questions appear when the agent is not sure.</p></div>
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
    <h2>Answered</h2>
    <div class="card list">
      {#each answered as q}<div class="done"><a href="/entry/{q.entryId}">{q.merchant}</a><span class="muted">{q.text}</span><span>→ {q.answer}</span></div>{/each}
    </div>
  {/if}
{/if}
<style>
  h1 { margin: 0 0 16px; font-size: 22px; } h2 { font-size: 15px; margin: 24px 0 8px; }
  .q { padding: 18px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  .meta { display: flex; gap: 14px; align-items: baseline; flex-wrap: wrap; } .meta a { font-weight: 500; }
  .text { margin: 0; font-size: 15px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; } .row input { flex: 1 1 260px; height: 36px; border: 1px solid var(--line-strong); border-radius: 6px; padding: 0 10px; }
  .empty { padding: 48px; text-align: center; } .big { font-size: 16px; font-weight: 500; margin: 0 0 6px; } .empty p { margin: 0; }
  .list { padding: 6px 16px; } .done { display: grid; grid-template-columns: 160px 1fr 1fr; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--line-soft); font-size: 13px; }
</style>
