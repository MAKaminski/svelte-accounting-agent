<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { call, money } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import { page } from '$app/state';
  import ErrorState from '$lib/components/ErrorState.svelte';
  let { data } = $props();

  type EditLine = { valueId: string; dollars: string; description: string };
  const toEdit = () => (data.entry?.recommendation?.lines.length
    ? data.entry.recommendation.lines.map((l) => ({ valueId: l.valueId, dollars: (l.amountCents / 100).toFixed(2), description: l.description ?? '' }))
    : [{ valueId: '', dollars: data.entry ? (data.entry.amountCents / 100).toFixed(2) : '0.00', description: '' }]);
  let lines = $state<EditLine[]>([]);
  let memo = $state('');
  let askText = $state('');
  let busy = $state<string | null>(null);
  let confirmReject = $state(false);
  let rejectReason = $state('');
  $effect(() => { data.entry; lines = toEdit(); memo = data.entry?.recommendation?.memo ?? ''; askText = data.entry?.recommendation?.question ?? ''; });

  const cents = (d: string) => Math.round(Number(d.replace(/[^0-9.-]/g, '')) * 100);
  const total = $derived(lines.reduce((s, l) => s + (Number.isFinite(cents(l.dollars)) ? cents(l.dollars) : 0), 0));
  const balanced = $derived(!!data.entry && total === data.entry.amountCents);
  const allChosen = $derived(lines.every((l) => l.valueId));
  const rec = $derived(data.entry?.recommendation);
  const edited = $derived(!!rec && (rec.action === 'ask' || JSON.stringify(lines.map((l) => [l.valueId, cents(l.dollars)])) !== JSON.stringify(rec.lines.map((l) => [l.valueId, l.amountCents]))));
  // Viewers see the decision but can't make it (the API returns 403 too).
  const isReviewer = $derived(['owner', 'reviewer'].includes(page.data.me?.role ?? ''));
  const decidable = $derived(!!data.entry && ['recommended', 'invalid', 'asked'].includes(data.entry.state));
  const canDecide = $derived(decidable && isReviewer);

  async function act(name: string, fn: () => Promise<void>) {
    busy = name;
    try { await fn(); } catch (e) { ui.toast((e as Error).message, { kind: 'error' }); } finally { busy = null; }
  }
  const approve = () => act('approve', async () => {
    const e = data.entry!;
    const payload: Record<string, unknown> = { id: e.id, yes: true, later: true, memo };
    if (edited) payload.lines = lines.map((l) => ({ valueId: l.valueId, amountCents: cents(l.dollars), ...(l.description ? { description: l.description } : {}) }));
    if (e.openQuestionId) payload.override = true;
    await call('entry.approve', payload);
    ui.toast(`Approved ${e.merchantName ?? e.description}`, { undo: async () => { await call('entry.undo', { id: e.id }); await invalidateAll(); } });
    await goto('/queue');
  });
  const ask = () => act('ask', async () => { await call('entry.ask', { id: data.entry!.id, text: askText }); ui.toast('Question sent to the owner'); await invalidateAll(); });
  const reject = () => act('reject', async () => { await call('entry.reject', { id: data.entry!.id, yes: true, reason: rejectReason || undefined }); ui.toast('Rejected — code it by hand in Slash'); await goto('/queue'); });
  const rerun = () => act('recommend', async () => { await call('entry.recommend', { id: data.entry!.id, force: true }); await invalidateAll(); });
  const addEval = () => act('eval', async () => { const c = await call<{ name: string }>('eval.add', { entry: data.entry!.id }); ui.toast(`Eval case added: ${c.name}`); });

  function onKey(ev: KeyboardEvent) {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement || ev.target instanceof HTMLTextAreaElement || ui.paletteOpen || ev.metaKey || ev.ctrlKey || !canDecide) return;
    if (ev.key === 'a' && !edited && balanced && allChosen) approve();
    else if (ev.key === 'e' && balanced && allChosen) approve();
    else if (ev.key === 'q') document.getElementById('ask')?.focus();
    else if (ev.key === 'x') confirmReject = true;
    else if (ev.key === 'Escape') goto('/queue');
  }
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>{data.entry?.merchantName ?? data.entry?.description ?? 'Entry'} · LaceLuxx Books</title></svelte:head>

<a href="/queue" class="back">← Queue</a>
{#if data.error || !data.entry}
  <ErrorState message={data.error?.message ?? 'Not found'} source={data.error?.source} onretry={() => invalidateAll()} />
{:else}
  {@const e = data.entry}
  <header>
    <h1>{e.merchantName ?? e.description}</h1>
    <span class="mono amt" class:credit={e.amountCents > 0}>{money(e.amountCents)}</span>
    <span class="muted">{e.date} · {e.id} · {e.ledgerName}: {e.ledgerStatus} · local: {e.state}</span>
  </header>
  <p class="writes">Writes to: <strong>{e.writesTo}</strong>{#if e.qboTxnId} · QuickBooks txn {e.qboTxnId}{/if}</p>
  {#if e.stateReason}<p class="reason" class:bad={e.state === 'invalid'}>{e.stateReason}</p>{/if}

  <div class="grid">
    <section class="card pane">
      <h2>Recommendation {#if rec}<span class="muted thin">· {rec.model} · confidence {rec.confidence.toFixed(2)}</span>{/if}</h2>
      {#if rec?.action === 'ask'}<p class="ask-note">The agent is not sure: {rec.question}</p>{/if}
      <div class="lines-head"><span>Account</span><span class="r">Amount</span><span>Line memo</span><span></span></div>
      {#each lines as l, i}
        <div class="line">
          <select aria-label="Line {i + 1} account" bind:value={l.valueId} disabled={!canDecide}>
            <option value="">Choose account…</option>
            {#each data.accounts as a}<option value={a.id}>{a.name}</option>{/each}
          </select>
          <input aria-label="Line {i + 1} amount" class="mono r" bind:value={l.dollars} disabled={!canDecide} />
          <input aria-label="Line {i + 1} memo" bind:value={l.description} disabled={!canDecide} />
          <button class="btn sm" type="button" aria-label="Remove line {i + 1}" disabled={lines.length === 1 || !canDecide} onclick={() => lines.splice(i, 1)}>×</button>
        </div>
      {/each}
      {#if canDecide}<button class="btn sm add" type="button" onclick={() => lines.push({ valueId: '', dollars: ((e.amountCents - total) / 100).toFixed(2), description: '' })}>+ Split line</button>{/if}
      <div class="total" class:ok={balanced} class:bad={!balanced}>
        <span>Lines total {money(total)}</span><span>{balanced ? 'Matches transaction ✓' : `Off by ${money(e.amountCents - total)}`}</span>
      </div>
      <label class="memo">Memo <input bind:value={memo} maxlength="200" disabled={!canDecide} /></label>
      {#if rec}<p class="reasoning">{rec.reasoning}</p>{/if}
      {#if canDecide}
        <div class="actions">
          {#if !edited}
            <button class="btn primary" type="button" onclick={approve} disabled={!!busy || !balanced || !allChosen}>Approve <span class="kbd">a</span></button>
          {:else}
            <button class="btn primary" type="button" onclick={approve} disabled={!!busy || !balanced || !allChosen}>Save edits &amp; approve <span class="kbd">e</span></button>
          {/if}
          <button class="btn" type="button" onclick={rerun} disabled={!!busy}>{busy === 'recommend' ? 'Recommending…' : 'Recommend again'}</button>
          <button class="btn danger push" type="button" onclick={() => (confirmReject = true)}>Reject <span class="kbd">x</span></button>
        </div>
        {#if e.openQuestionId}<p class="muted small">This entry has an open question. Approving now overrides it.</p>{/if}
        {#if !e.openQuestionId}
          <div class="askbox">
            <label for="ask">Ask the owner <span class="kbd">q</span></label>
            <div class="askrow"><input id="ask" bind:value={askText} placeholder="One plain question, with your best guess" />
              <button class="btn warn" type="button" onclick={ask} disabled={!!busy || !askText.trim()}>Ask</button></div>
          </div>
        {/if}
      {:else if decidable && !isReviewer}
        <div class="actions" title="Reviewer role needed">
          <button class="btn primary" type="button" disabled>Approve</button>
          <button class="btn" type="button" disabled>Ask</button>
          <button class="btn danger push" type="button" disabled>Reject</button>
        </div>
        <p class="muted small">Reviewer role needed</p>
      {:else if ['ready', 'coded', 'synced', 'approved'].includes(e.state)}
        <div class="actions"><button class="btn" type="button" onclick={addEval} disabled={!!busy}>Add as eval case</button></div>
      {/if}
      {#if confirmReject}
        <div class="confirm" role="dialog" aria-label="Confirm reject">
          <p>Reject this recommendation? The entry stays in review in Slash for hand coding.</p>
          <input bind:value={rejectReason} placeholder="Reason (optional)" aria-label="Reason" />
          <div class="actions"><button class="btn danger" type="button" onclick={reject}>Reject</button><button class="btn" type="button" onclick={() => (confirmReject = false)}>Cancel</button></div>
        </div>
      {/if}
    </section>

    <section class="side">
      <div class="card pane">
        <h2>Evidence</h2>
        {#each e.evidence as x}
          <div class="ev"><span class="mono muted">{x.id}</span><span class="kind">{x.kind}</span><span>{x.summary}</span></div>
        {:else}<p class="muted">No evidence — research found nothing.</p>{/each}
      </div>
      {#if rec}
        <div class="card pane run">
          <h2>Run</h2>
          <span>prompt {rec.promptVersion}</span>
          <span>tokens {rec.tokens.cacheRead.toLocaleString()} cached read / {rec.tokens.cacheWrite.toLocaleString()} cache write / {rec.tokens.fresh.toLocaleString()} fresh / {rec.tokens.out.toLocaleString()} out · ${rec.costUsd.toFixed(5)}</span>
          <span>TTFT {rec.ttftMs ?? '–'} ms · e2e {rec.e2eMs ?? '–'} ms{rec.shadowAutoApprove ? ' · shadow: would auto-approve' : ''}</span>
        </div>
      {/if}
      {#if e.decisions.length}
        <div class="card pane run">
          <h2>Decisions</h2>
          {#each e.decisions as d}<span>{d.decidedAt.slice(0, 19).replace('T', ' ')} · {d.action} by {d.decidedBy}</span>{/each}
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .back { font-size: 13px; text-decoration: none; }
  header { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; margin: 10px 0 12px; }
  h1 { margin: 0; font-size: 22px; font-weight: 600; }
  .amt { font-size: 18px; } .credit { color: var(--ok); }
  .writes { margin: -4px 0 10px; font-size: 13px; color: var(--ink-2); }
  .reason { margin: 0 0 12px; font-size: 13px; color: var(--muted); } .reason.bad { color: var(--danger); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }
  .pane { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  h2 { margin: 0; font-size: 15px; font-weight: 600; } .thin { font-weight: 400; }
  .lines-head, .line { display: grid; grid-template-columns: 1fr 110px 1fr 34px; gap: 8px; align-items: center; }
  .lines-head { font-size: 12px; color: var(--muted); font-weight: 500; }
  select, .line input, .memo input, .askrow input, .confirm input { height: 34px; border: 1px solid var(--line-strong); border-radius: 6px; padding: 0 8px; min-width: 0; }
  .r { text-align: right; }
  .add { align-self: flex-start; }
  .total { display: flex; justify-content: space-between; padding: 10px 12px; border-radius: 6px; font-size: 13px; }
  .total.ok { background: var(--ok-soft); color: var(--ok); } .total.bad { background: var(--danger-soft); color: var(--danger); }
  .memo { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); font-weight: 500; }
  .reasoning { margin: 0; color: var(--ink-2); }
  .ask-note { margin: 0; padding: 10px 12px; border-radius: 6px; background: var(--warn-soft); color: var(--warn-ink); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; } .push { margin-left: auto; }
  .askbox { display: flex; flex-direction: column; gap: 6px; font-size: 13px; border-top: 1px solid var(--line-soft); padding-top: 12px; }
  .askrow { display: flex; gap: 8px; } .askrow input { flex: 1; }
  .confirm { border: 1px solid var(--danger-line); background: var(--danger-soft); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .confirm p { margin: 0; }
  .side { display: flex; flex-direction: column; gap: 16px; }
  .ev { display: grid; grid-template-columns: 90px 120px 1fr; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line-soft); font-size: 13px; }
  .kind { font-weight: 500; }
  .run span { font-size: 13px; color: var(--ink-2); }
  .small { font-size: 12px; margin: 0; }
</style>
