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
  const evSrc: Record<string, [string, string]> = {
    mcc: ['MCC', 'Merchant category'], slash_history: ['SL', 'Slash history'], qbo_history: ['QB', 'QuickBooks history'],
    payout_row: ['CSV', 'Payout report'], owner_answer: ['YOU', 'Owner answer'], merchant_profile: ['WEB', 'Merchant profile']
  };
  const STEPS = [['fetched', 'Pulled'], ['researched', 'Researched'], ['recommended', 'Recommended'], ['approved', 'Approved'], ['ready', 'Sent']] as const;
  const stepIndex = (state: string) => ({ fetched: 0, researched: 1, recommended: 2, invalid: 2, asked: 2, rejected: 2, approved: 3, coded: 3, ready: 4, synced: 4 } as Record<string, number>)[state] ?? 0;
  const day = (iso: string | null) => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
  const modelName = (m0: string) => { const m = m0.replace(/^fixture:/, ''); return m.startsWith('rules:') ? 'Coded by a rule, no model call' : m.startsWith('off:') ? 'Agent switched off' : m.startsWith('cache') ? 'Reused an earlier answer' : m.replace('claude-', 'Claude ').replace(/-(\d)-(\d)$/, ' $1.$2').replace(/\b[a-z]/, (c) => c.toUpperCase()); };
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>{data.entry?.merchantName ?? data.entry?.description ?? 'Entry'} · Accounting Agent</title></svelte:head>

<a href="/queue" class="back">Queue</a><span class="crumb"> / {data.entry?.merchantName ?? data.entry?.description ?? 'Entry'}</span>
{#if data.error || !data.entry}
  <ErrorState message={data.error?.message ?? 'Not found'} source={data.error?.source} onretry={() => invalidateAll()} />
{:else}
  {@const e = data.entry}
  {@const at = stepIndex(e.state)}
  <header>
    <div>
      <h1>{e.merchantName ?? e.description} <span class="mono amt" class:credit={e.amountCents > 0}>{money(e.amountCents)}</span></h1>
      <p class="meta"><span class="lbadge {e.ledgerKind}">{e.ledgerName}</span><span>{day(e.date)}</span><span class="mono muted small">{e.id}</span></p>
    </div>
    <ol class="steps" aria-label="Progress">
      {#each STEPS as [, label], i}<li class:done={i < at} class:now={i === at}>{label}</li>{/each}
    </ol>
  </header>
  <p class="writes">Writes to: <strong>{e.writesTo}</strong>{#if e.qboTxnId} · QuickBooks txn {e.qboTxnId}{/if}</p>
  {#if e.stateReason}<p class="reason" class:bad={e.state === 'invalid'}>{e.stateReason}</p>{/if}

  <div class="grid">
    <section class="card pane">
      <div class="phead">
        <h2>The agent's coding</h2>
        {#if rec && rec.action === 'code' && !rec.model.startsWith('off:')}
          <span class="conf"><span class="meter" class:low={rec.confidence < 0.75} style="width: 80px"><i style="width: {Math.round(rec.confidence * 100)}%"></i></span><span class="mono small">{rec.confidence.toFixed(2)} confident</span></span>
        {/if}
      </div>
      {#if rec?.action === 'ask'}<p class="ask-note">The agent is not sure: {rec.question}</p>
      {:else if rec?.reasoning}<p class="quote">{rec.reasoning}</p>{/if}
      <div class="lines">
        <div class="lines-head"><span>Account</span><span class="r">Amount</span><span>Line memo</span><span></span></div>
        {#each lines as l, i}
          <div class="line">
            <select aria-label="Line {i + 1} account" bind:value={l.valueId} disabled={!canDecide}>
              <option value="">Choose account…</option>
              {#each data.accounts as a}<option value={a.id}>{a.name}</option>{/each}
            </select>
            <input aria-label="Line {i + 1} amount" class="mono r" bind:value={l.dollars} disabled={!canDecide} />
            <input aria-label="Line {i + 1} memo" bind:value={l.description} disabled={!canDecide} />
            <button class="rm" type="button" aria-label="Remove line {i + 1}" disabled={lines.length === 1 || !canDecide} onclick={() => lines.splice(i, 1)}>×</button>
          </div>
        {/each}
        <div class="total" class:ok={balanced} class:bad={!balanced}>
          {#if canDecide}<button class="addline" type="button" onclick={() => lines.push({ valueId: '', dollars: ((e.amountCents - total) / 100).toFixed(2), description: '' })}>Add a split line</button>{:else}<span></span>{/if}
          <span class="mono">{money(total)} {balanced ? 'balanced' : `off by ${money(e.amountCents - total)}`}</span>
        </div>
      </div>
      <label class="memo">Memo <input bind:value={memo} maxlength="200" disabled={!canDecide} /></label>
      {#if rec?.action === 'ask' && rec.reasoning}<p class="reasoning">{rec.reasoning}</p>{/if}
      {#if canDecide}
        {#if !e.openQuestionId}
          <div class="askbox">
            <label for="ask">Ask the owner <span class="kbd">q</span></label>
            <div class="askrow"><input id="ask" bind:value={askText} placeholder="One plain question, with your best guess" />
              <button class="btn" type="button" onclick={ask} disabled={!!busy || !askText.trim()}>Ask</button></div>
          </div>
        {:else}<p class="muted small">This entry has an open question. Approving now overrides it.</p>{/if}
        <div class="actions foot">
          {#if !edited}
            <button class="btn primary" type="button" onclick={approve} disabled={!!busy || !balanced || !allChosen}>Approve <span class="kbd">a</span></button>
          {:else}
            <button class="btn primary" type="button" onclick={approve} disabled={!!busy || !balanced || !allChosen}>Save edits &amp; approve <span class="kbd">e</span></button>
          {/if}
          <button class="btn ghost" type="button" onclick={rerun} disabled={!!busy}>{busy === 'recommend' ? 'Recommending…' : 'Recommend again'}</button>
          <button class="btn danger push" type="button" onclick={() => (confirmReject = true)}>Reject <span class="kbd">x</span></button>
        </div>
        <p class="muted small note">Approving sends this after a {Math.round((page.data.settings?.undoWindowMs ?? 10000) / 1000)} second undo window.</p>
      {:else if decidable && !isReviewer}
        <div class="actions foot" title="Reviewer role needed">
          <button class="btn primary" type="button" disabled>Approve</button>
          <button class="btn" type="button" disabled>Ask</button>
          <button class="btn danger push" type="button" disabled>Reject</button>
        </div>
        <p class="muted small note">Reviewer role needed</p>
      {:else if ['ready', 'coded', 'synced', 'approved'].includes(e.state)}
        <div class="actions foot"><button class="btn" type="button" onclick={addEval} disabled={!!busy}>Add as eval case</button></div>
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
        <h2>What it looked at</h2>
        <div class="evs">
          {#each e.evidence as x}
            {@const src = evSrc[x.kind] ?? ['•', x.kind]}
            <div class="ev"><span class="src" aria-hidden="true">{src[0]}</span><div><div class="evk">{src[1]}</div><div class="evs-sum">{x.summary}</div></div></div>
          {:else}<p class="muted">Research found nothing for this one.</p>{/each}
        </div>
        {#if rec}
          <p class="runline"><span>{modelName(rec.model)}{rec.shadowAutoApprove ? ' · would auto-approve' : ''}</span><span class="mono">{rec.e2eMs != null ? `${(rec.e2eMs / 1000).toFixed(1)} s` : ''}{rec.costUsd ? ` · $${rec.costUsd.toFixed(4)}` : ''}</span></p>
          <details class="tech"><summary>Technical details</summary>
            <span>prompt {rec.promptVersion}</span>
            <span>tokens {rec.tokens.cacheRead.toLocaleString()} cached read / {rec.tokens.cacheWrite.toLocaleString()} cache write / {rec.tokens.fresh.toLocaleString()} fresh / {rec.tokens.out.toLocaleString()} out</span>
            <span>TTFT {rec.ttftMs ?? '–'} ms · e2e {rec.e2eMs ?? '–'} ms · {rec.model}</span>
          </details>
        {/if}
      </div>
      {#if e.decisions.length}
        <div class="card pane">
          <h2>Decisions</h2>
          <div class="decs">{#each e.decisions as d}<span><span class="mono muted">{d.decidedAt.slice(0, 16).replace('T', ' ')}</span> {d.action} by {d.decidedBy}</span>{/each}</div>
        </div>
      {/if}
    </section>
  </div>
{/if}

<style>
  .back { font-size: 13px; text-decoration: none; color: var(--text-muted); } .back:hover { color: var(--text); }
  .crumb { font-size: 13px; color: var(--text-muted); }
  header { display: flex; align-items: flex-end; gap: 20px; flex-wrap: wrap; margin: 10px 0 14px; }
  h1 { margin: 0; }
  .amt { font-size: 22px; margin-left: 10px; font-weight: 500; } .credit { color: var(--ok); }
  .meta { margin: 8px 0 0; display: flex; gap: 10px; align-items: center; color: var(--text-2); }
  .lbadge { padding: 1px 7px; border-radius: 6px; font-size: 11px; font-weight: 500; border: 1px solid color-mix(in srgb, var(--info) 35%, transparent); color: var(--info); }
  .lbadge.mercury { border-color: color-mix(in srgb, var(--violet) 35%, transparent); color: var(--violet); }
  .steps { margin: 0 0 4px auto; padding: 0; list-style: none; display: flex; align-items: center; font-size: 12.5px; color: var(--text-muted); }
  .steps li { display: flex; align-items: center; }
  .steps li + li::before { content: ''; width: 18px; height: 1px; margin: 0 8px; background: var(--hair-strong); }
  .steps li.done { color: var(--text); } .steps li.now { color: var(--violet); font-weight: 500; }
  .writes { margin: 0 0 14px; font-size: 13px; color: var(--text-2); }
  .writes strong { color: var(--text); font-weight: 500; }
  .reason { margin: -6px 0 14px; font-size: 13px; color: var(--text-muted); } .reason.bad { color: var(--danger); }
  .grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; align-items: start; }
  .pane { padding: 20px 22px; display: flex; flex-direction: column; gap: 16px; }
  .phead { display: flex; align-items: center; gap: 10px; } .conf { margin-left: auto; display: flex; align-items: center; gap: 8px; }
  .quote { margin: 0; border-left: 2px solid var(--accent-solid); padding: 2px 0 2px 14px; font-size: 15px; line-height: 1.5; }
  .ask-note { margin: 0; padding: 12px 14px; border-radius: var(--r-1); background: var(--warn-soft); color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent); font-size: 15px; line-height: 1.5; }
  .lines { display: flex; flex-direction: column; gap: 8px; }
  .lines-head, .line { display: grid; grid-template-columns: minmax(0, 1.2fr) 116px minmax(0, 1fr) 28px; gap: 10px; align-items: center; }
  .lines-head { font-size: 12.5px; color: var(--text-muted); }
  select, .line input, .memo input, .askrow input, .confirm input { height: 36px; padding: 0 10px; min-width: 0; width: 100%; }
  .r { text-align: right; }
  .rm { width: 28px; height: 28px; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); font-size: 16px; cursor: pointer; }
  .rm:hover:not(:disabled) { background: var(--hair); color: var(--text); } .rm:disabled { opacity: .3; cursor: default; }
  .total { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; padding: 2px 38px 0 0; }
  .total.ok { color: var(--ok); } .total.bad { color: var(--danger); }
  .addline { border: 0; background: none; padding: 0; color: var(--text-muted); font: inherit; cursor: pointer; } .addline:hover { color: var(--text); }
  .memo { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text-muted); }
  .reasoning { margin: 0; color: var(--text-2); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; } .push { margin-left: auto; }
  .foot { padding-top: 16px; border-top: 1px solid var(--hair); }
  .note { margin: -8px 0 0; }
  .askbox { display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text-muted); }
  .askrow { display: flex; gap: 8px; } .askrow input { flex: 1; }
  .confirm { border: 1px solid var(--danger-line); background: var(--danger-soft); border-radius: var(--r-2); padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .confirm p { margin: 0; }
  .side { display: flex; flex-direction: column; gap: 20px; }
  .evs { display: flex; flex-direction: column; }
  .ev { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--hair-soft); }
  .ev:last-child { border-bottom: 0; } .ev:first-child { padding-top: 0; }
  .src { width: 34px; height: 30px; border-radius: 8px; background: var(--raised); border: 1px solid var(--hair); display: grid; place-items: center; font-size: 10px; font-weight: 600; color: var(--text-2); flex-shrink: 0; }
  .evk { font-size: 13.5px; } .evs-sum { font-size: 12.5px; color: var(--text-2); margin-top: 1px; }
  .runline { margin: 0; padding-top: 14px; border-top: 1px solid var(--hair); display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; color: var(--text-muted); }
  .tech { font-size: 12px; color: var(--text-muted); } .tech summary { cursor: pointer; } .tech span { display: block; margin-top: 4px; font-family: var(--mono); }
  .decs { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--text-2); }
  .small { font-size: 12.5px; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .steps { margin-left: 0; } }
</style>
