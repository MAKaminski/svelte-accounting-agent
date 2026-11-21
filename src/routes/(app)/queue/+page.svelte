<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { call, money } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import { page } from '$app/state';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import type { Entry } from '$lib/types';
  let { data } = $props();
  const isReviewer = $derived(['owner', 'reviewer'].includes(page.data.me?.role ?? ''));

  const filters = [
    { key: 'recommended', label: 'To review' },
    { key: 'asked', label: 'Waiting on owner' },
    { key: 'invalid', label: "Can't code" },
    { key: 'approved', label: 'Sending' },
    { key: 'ready', label: 'Done' }
  ];
  let hidden = $state<Set<string>>(new Set());
  let pulling = $state(false);
  let pullError = $state<{ message: string; source: string } | null>(null);

  const ledgers = $derived([...new Map(data.all.map((e) => [e.connectionId, e.ledgerName])).entries()]);
  const scoped = $derived(data.connection ? data.all.filter((e) => e.connectionId === data.connection) : data.all);
  const rows = $derived(scoped.filter((e) => e.state === data.state && !hidden.has(e.id)));
  const counts = $derived(Object.fromEntries(filters.map((f) => [f.key, scoped.filter((e) => e.state === f.key).length])));
  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams({ state: data.state, ...(data.connection ? { connection: data.connection } : {}) });
    for (const [k, v] of Object.entries(patch)) v === null ? p.delete(k) : p.set(k, v);
    return `?${p}`;
  };
  const invalidCount = $derived(counts.invalid ?? 0);

  $effect(() => { if (rows.length && !rows.some((r) => r.id === ui.selectedId)) ui.selectedId = rows[0].id; });

  async function pull() {
    pulling = true; pullError = null;
    try {
      const r = await call<{ pulled: number; newMerchants: number }>('entries.pull', { wait: true });
      ui.toast(`Pulled ${r.pulled} entries in review · ${r.newMerchants} new merchants`);
      await invalidateAll();
    } catch (e) { const err = e as { message: string; source?: string }; pullError = { message: err.message, source: err.source ?? 'app' }; }
    finally { pulling = false; }
  }

  async function approveRow(e: Entry) {
    if (!e.recommendation || e.recommendation.action !== 'code') { goto(`/entry/${e.id}`); return; }
    hidden = new Set([...hidden, e.id]); // optimistic: row fades within one frame
    try {
      await call('entry.approve', { id: e.id, yes: true, later: true });
      const acct = e.recommendation.lines.length > 1 ? `split (${e.recommendation.lines.length} lines)` : e.recommendation.lines[0].accountName;
      ui.toast(`Approved ${e.merchantName ?? e.description} → ${acct}`, {
        undo: async () => {
          await call('entry.undo', { id: e.id });
          hidden = new Set([...hidden].filter((x) => x !== e.id));
          await invalidateAll();
        }
      });
      await invalidateAll();
    } catch (err) {
      hidden = new Set([...hidden].filter((x) => x !== e.id));
      ui.toast((err as Error).message, { kind: 'error' });
    }
  }

  function onKey(ev: KeyboardEvent) {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement || ui.paletteOpen || ev.metaKey || ev.ctrlKey) return;
    const i = rows.findIndex((r) => r.id === ui.selectedId);
    if (ev.key === 'j' || ev.key === 'ArrowDown') { ui.selectedId = rows[Math.min(i + 1, rows.length - 1)]?.id ?? null; ev.preventDefault(); }
    else if (ev.key === 'k' || ev.key === 'ArrowUp') { ui.selectedId = rows[Math.max(i - 1, 0)]?.id ?? null; ev.preventDefault(); }
    else if (ev.key === 'p') pull();
    else if (ev.key === 'a' && rows[i] && isReviewer) approveRow(rows[i]);
    else if ((ev.key === 'Enter' || ev.key === 'e' || ev.key === 'q') && rows[i]) goto(`/entry/${rows[i].id}`);
    else if (ev.key === 'u') { const t = [...ui.toasts].reverse().find((x) => x.undo); if (t) t.undo!().then(() => ui.dismiss(t.id)); }
  }
  const day = (iso: string | null) => (iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
  const initials = (s: string) => s.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  // Routine = the agent coded it (not a question) with high confidence. Bulk approve still records one decision,
  // one audit row and one undo window per item.
  const routine = $derived(rows.filter((e) => e.state === 'recommended' && e.recommendation?.action === 'code' && e.recommendation.confidence >= 0.9));
  let confirmBulk = $state(false);
  let bulkBusy = $state(false);
  async function approveRoutine() {
    const batch = [...routine];
    confirmBulk = false; bulkBusy = true;
    hidden = new Set([...hidden, ...batch.map((e) => e.id)]);
    const done: Entry[] = [];
    try {
      for (const e of batch) { await call('entry.approve', { id: e.id, yes: true, later: true }); done.push(e); }
      ui.toast(`Approved ${done.length} routine transactions`, {
        undo: async () => {
          for (const e of done) await call('entry.undo', { id: e.id }).catch(() => undefined);
          hidden = new Set([...hidden].filter((x) => !done.some((e) => e.id === x)));
          await invalidateAll();
        }
      });
    } catch (err) {
      hidden = new Set([...hidden].filter((x) => done.some((e) => e.id === x)));
      ui.toast(`Stopped after ${done.length} of ${batch.length}: ${(err as Error).message}`, { kind: 'error', ms: 8000 });
    } finally { bulkBusy = false; await invalidateAll(); }
  }
  const acct = (e: Entry) => !e.recommendation ? '—' : e.recommendation.model.startsWith('off:') ? 'Manual (agent off)' : e.recommendation.action === 'ask' ? 'Needs your answer' : e.recommendation.lines.length > 1 ? `Split (${e.recommendation.lines.length} lines)` : e.recommendation.lines[0]?.accountName;
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>Queue · Accounting Agent</title></svelte:head>

<header>
  <div>
    <h1>Review queue</h1>
    <p class="sub">{#if counts.recommended}{counts.recommended} transaction{counts.recommended === 1 ? '' : 's'} coded by the agent {counts.recommended === 1 ? 'is' : 'are'} waiting for you{#if routine.length && data.state === 'recommended'}. {routine.length} look routine{/if}.{:else}You're all caught up.{/if}</p>
  </div>
  <div class="actions">
    <button class="btn" type="button" onclick={pull} disabled={pulling}>
      {#if pulling}<span class="spin" aria-hidden="true"></span> Pulling…{:else}Pull entries <span class="kbd">p</span>{/if}
    </button>
    {#if data.state === 'recommended' && routine.length > 1 && isReviewer}
      {#if confirmBulk}
        <button class="btn primary" type="button" onclick={approveRoutine} disabled={bulkBusy}>Confirm: approve {routine.length}</button>
        <button class="btn ghost" type="button" onclick={() => (confirmBulk = false)}>Cancel</button>
      {:else}
        <button class="btn primary" type="button" onclick={() => (confirmBulk = true)} disabled={bulkBusy} title="Coded with confidence 0.90 or higher. Each one keeps its own undo window.">Approve {routine.length} routine</button>
      {/if}
    {/if}
  </div>
</header>

<div class="filters">
  <div class="chips" role="tablist" aria-label="Filter by state">
    {#each filters as f}
      <a role="tab" aria-selected={data.state === f.key} class="chip" class:on={data.state === f.key} href={qs({ state: f.key })} data-sveltekit-noscroll>{f.label} <b class:bad={f.key === 'invalid' && (counts[f.key] ?? 0) > 0 && data.state !== f.key}>{counts[f.key] ?? 0}</b></a>
    {/each}
  </div>
  {#if ledgers.length > 1}
    <div class="chips right" role="group" aria-label="Filter by ledger">
      <a class="chip" class:on={!data.connection} href={qs({ connection: null })} data-sveltekit-noscroll>All ledgers</a>
      {#each ledgers as [id, name]}<a class="chip" class:on={data.connection === id} href={qs({ connection: id })} data-sveltekit-noscroll>{name}</a>{/each}
    </div>
  {/if}
</div>

{#if pullError}<ErrorState message={pullError.message} source={pullError.source} onretry={pull} />{/if}

{#if data.error}
  <ErrorState message={data.error.message} source={data.error.source} onretry={() => invalidateAll()} />
{:else if pulling && !data.all.length}
  <div class="card table" aria-label="Loading">
    {#each Array(7) as _}<div class="skeleton" style="height: 22px; margin: 16px 20px;"></div>{/each}
  </div>
{:else if !rows.length}
  <div class="card empty">
    <span class="ring" aria-hidden="true">✓</span>
    <p class="big">{data.state === 'recommended' ? 'Nothing to review.' : `Nothing here: ${filters.find((f) => f.key === data.state)?.label.toLowerCase()}.`}</p>
    <p class="muted">{data.all.length ? `${data.all.length} entries in other states.` : 'No entries pulled yet. Pull to fetch transactions from your ledgers.'}</p>
    {#if data.state === 'recommended'}<button class="btn" type="button" onclick={pull}>Pull entries</button>{/if}
  </div>
{:else}
  {#if data.state === 'recommended' && invalidCount}
    <p class="partial"><a href="?state=invalid">{invalidCount} entr{invalidCount === 1 ? 'y' : 'ies'} failed validation</a> — the rest are usable.</p>
  {/if}
  <div class="card table">
    <div class="row head" role="row">
      <span>Date</span><span>Merchant</span><span class="r">Amount</span><span>Account</span><span>Confidence</span><span>Why</span><span></span>
    </div>
    {#each rows as e (e.id)}
      {@const rec = e.recommendation}
      {@const asks = rec?.action === 'ask' || e.state === 'asked'}
      <div class="row" role="row" class:sel={ui.selectedId === e.id} class:ask={asks} class:bad={e.state === 'invalid'}
        tabindex="0" onfocus={() => (ui.selectedId = e.id)} onclick={() => (ui.selectedId = e.id)} ondblclick={() => goto(`/entry/${e.id}`)}
        onkeydown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) { ev.stopPropagation(); goto(`/entry/${e.id}`); } }} aria-selected={ui.selectedId === e.id}>
        <span class="mono muted date">{day(e.date)}</span>
        <span class="mcell">
          <span class="avatar" aria-hidden="true">{initials(e.merchantName ?? e.description ?? "")}</span>
          <a class="merchant" href="/entry/{e.id}" title={e.merchantName ?? e.description}>{e.merchantName ?? e.description}</a>
          {#if ledgers.length > 1}<span class="lbadge {e.ledgerKind}">{e.ledgerName}</span>{/if}
        </span>
        <span class="r mono" class:credit={e.amountCents > 0}>{money(e.amountCents)}</span>
        <span class="acct" class:q={asks} class:f={e.state === 'invalid'}>{e.state === 'invalid' ? "Can't code yet" : acct(e)}</span>
        <span class="conf">
          {#if rec && rec.action === 'code' && !rec.model.startsWith('off:')}
            <span class="meter" class:low={rec.confidence < 0.75}><i style="width: {Math.round(rec.confidence * 100)}%"></i></span><span class="mono small">{rec.confidence.toFixed(2)}</span>
          {:else}<span class="muted small">{asks ? 'Needs you' : '—'}</span>{/if}
        </span>
        <span class="why" title={e.state === 'invalid' ? e.stateReason : asks ? rec?.question : rec?.reasoning}>{e.state === 'invalid' ? e.stateReason : rec?.action === 'ask' ? rec.question : rec?.reasoning}</span>
        <span class="act">
          {#if e.state === 'recommended' && rec?.action === 'code'}
            <button class="btn sm" class:primary={ui.selectedId === e.id} type="button" disabled={!isReviewer} title={isReviewer ? undefined : 'Reviewer role needed'} onclick={(ev) => { ev.stopPropagation(); approveRow(e); }}>Approve {#if ui.selectedId === e.id}<span class="kbd">a</span>{/if}</button>
          {:else if e.state === 'recommended' || e.state === 'asked'}
            <a class="btn sm" href="/entry/{e.id}">{e.state === 'asked' ? 'Asked' : rec?.model.startsWith('off:') ? 'Code' : 'Answer'}</a>
          {:else if e.state === 'invalid'}
            <a class="btn sm" href="/entry/{e.id}">Fix</a>
          {:else}
            <span class="muted small">{e.state}</span>
          {/if}
        </span>
      </div>
    {/each}
  </div>
  <p class="muted small hint"><span class="kbd">j</span> <span class="kbd">k</span> move <span class="kbd">a</span> approve <span class="kbd">Enter</span> open <span class="kbd">p</span> pull <span class="kbd">u</span> undo <span class="kbd">⌘K</span> commands</p>
{/if}

<style>
  header { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  h1 { margin: 0; }
  .sub { margin: 4px 0 0; color: var(--text-2); }
  .actions { margin-left: auto; display: flex; gap: 8px; }
  .filters { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .chips.right { margin-left: auto; }
  .chip b { font-weight: 600; font-variant-numeric: tabular-nums; }
  .chip b.bad { color: var(--danger); }
  .table { overflow-x: auto; }
  .row { display: grid; grid-template-columns: 56px minmax(170px, 1.5fr) 92px minmax(130px, 1.1fr) 96px minmax(130px, 2.2fr) 96px; gap: 14px; padding: 0 20px; min-height: 54px; align-items: center; border-bottom: 1px solid var(--hair-soft); min-width: 860px; cursor: default; font-size: 13.5px; transition: background var(--t-fast) var(--ease); animation: rowin var(--t) var(--ease); }
  @keyframes rowin { from { opacity: 0; } to { opacity: 1; } }
  .row:last-child { border-bottom: 0; }
  .row:not(.head):hover { background: var(--hair-soft); }
  .row.head { min-height: 40px; font-size: 12.5px; color: var(--text-muted); background: var(--sunken); border-bottom-color: var(--hair); position: sticky; top: 0; z-index: 1; animation: none; }
  .row.sel { box-shadow: inset 2px 0 0 var(--accent-solid); background: var(--accent-tint); }
  .row.bad { box-shadow: inset 2px 0 0 var(--danger); }
  .r { text-align: right; }
  .date { font-size: 12.5px; }
  .mcell { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .lbadge { flex-shrink: 0; padding: 1px 7px; border-radius: 6px; font-size: 11px; font-weight: 500; border: 1px solid color-mix(in srgb, var(--info) 35%, transparent); color: var(--info); }
  .lbadge.mercury { border-color: color-mix(in srgb, var(--violet) 35%, transparent); color: var(--violet); }
  .merchant { font-weight: 500; color: var(--text); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .merchant:hover { text-decoration: underline; }
  .credit { color: var(--ok); }
  .acct { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acct.q { color: var(--warn); } .acct.f { color: var(--danger); }
  .conf { display: flex; align-items: center; gap: 8px; }
  .why { color: var(--text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .act { display: flex; justify-content: flex-end; }
  .empty { padding: 64px 24px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  .ring { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); font-size: 18px; border: 1px solid color-mix(in srgb, var(--ok) 30%, transparent); }
  .big { font-size: 16px; font-weight: 500; margin: 4px 0 0; }
  .empty p { margin: 0; }
  .partial { margin: 0 0 10px; font-size: 13px; color: var(--danger); }
  .hint { margin-top: 12px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .hint .kbd { margin-left: 8px; }
  .hint .kbd:first-child { margin-left: 0; }
  .spin { width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
