<script lang="ts">
  import { goto } from '$app/navigation';
  import { call } from '$lib/client';
  let { data } = $props();
  let name = $state('');
  let business = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  const examples = [
    'Online store selling handmade candles on Shopify and Etsy; paid through Shopify Payments and Etsy payouts.',
    'Two-person design agency; clients pay invoices by ACH; most spend is software and contractors.',
    'Residential plumbing company; customers pay by card on site; buys parts from supply houses.'
  ];
  async function create(ev: SubmitEvent) {
    ev.preventDefault();
    busy = true; error = null;
    try {
      await call('company.create', { name, business });
      await goto('/settings?welcome=1', { invalidateAll: true });
    } catch (e) { error = (e as Error).message; } finally { busy = false; }
  }
</script>
<svelte:head><title>Create your company · Accounting Agent</title></svelte:head>
<main class="welcome">
  <div class="stack">
    <div class="intro">
      <span class="mark" aria-hidden="true">A</span>
      <h1>{data.hasCompany ? 'Add another company' : 'Create your company'}</h1>
      <p>Signed in as {data.email}. Two fields, then you connect your bank or card ledger and QuickBooks.</p>
    </div>
    <form class="panel" onsubmit={create}>
      <label>Company name
        <input bind:value={name} required maxlength="120" placeholder="Acme Supply Co." autocomplete="organization" />
      </label>
      <label>What does it do? <span class="muted">(the agent reads this to judge what each purchase is for)</span>
        <textarea bind:value={business} required maxlength="600" rows="4" placeholder="What you sell, who pays you and how (Stripe, marketplace payouts, invoices)…"></textarea>
      </label>
      <div class="ex"><span class="muted small">Examples:</span>
        {#each examples as e}<button type="button" class="chip" onclick={() => (business = e)}>{e.split(';')[0]}</button>{/each}
      </div>
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <button class="btn primary big" type="submit" disabled={busy || !name.trim() || !business.trim()}>{busy ? 'Creating…' : 'Create company'}</button>
      <p class="muted small">You become the owner. Nothing is connected yet, and nothing is written anywhere until you approve it.</p>
    </form>
    <form method="POST" action="/logout" class="out"><button class="link" type="submit">Sign out</button>{#if data.hasCompany}<a class="link" href="/queue">Back to the app</a>{/if}</form>
  </div>
</main>
<style>
  .welcome { min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: radial-gradient(900px 520px at 50% 18%, rgb(110 124 255 / .20), transparent 70%), radial-gradient(700px 420px at 72% 80%, rgb(165 107 255 / .12), transparent 70%), var(--page); }
  .stack { width: min(520px, 100%); display: flex; flex-direction: column; gap: 22px; }
  .intro { display: flex; flex-direction: column; gap: 10px; align-items: center; text-align: center; }
  .mark { width: 44px; height: 44px; border-radius: 12px; background: var(--grad); display: grid; place-items: center; font-size: 20px; font-weight: 700; color: #fff; box-shadow: var(--glow); }
  h1 { margin: 0; font-size: 26px; }
  .intro p { margin: 0; color: var(--text-2); font-size: 14.5px; }
  .panel { background: color-mix(in srgb, var(--panel) 88%, transparent); border: 1px solid var(--hair); border-radius: var(--r-2); padding: 22px; display: flex; flex-direction: column; gap: 16px; box-shadow: var(--shadow-2); }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; font-weight: 500; }
  label .muted { font-weight: 400; font-size: 12.5px; }
  input, textarea { font: inherit; font-size: 14px; padding: 10px 12px; border-radius: var(--r-1); border: 1px solid var(--hair-strong); background: var(--sunken); color: var(--text); resize: vertical; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .chip { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--hair-strong); background: transparent; color: var(--text-2); cursor: pointer; }
  .chip:hover { border-color: var(--accent); color: var(--text); }
  .big { height: 44px; font-size: 14.5px; }
  .err { margin: 0; padding: 10px 12px; border-radius: var(--r-1); background: var(--danger-soft); border: 1px solid var(--danger-line); color: var(--danger); font-size: 13px; }
  .small { font-size: 12.5px; margin: 0; }
  .out { display: flex; justify-content: center; gap: 18px; }
  .link { background: none; border: 0; color: var(--text-muted); font: inherit; font-size: 13px; cursor: pointer; text-decoration: underline; }
</style>
