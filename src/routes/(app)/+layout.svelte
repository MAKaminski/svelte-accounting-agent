<script lang="ts">
  import { page, navigating } from '$app/state';
  import Palette from '$lib/components/Palette.svelte';
  import Toasts from '$lib/components/Toasts.svelte';
  import { ui } from '$lib/ui.svelte';
  import { call } from '$lib/client';
  import { invalidateAll } from '$app/navigation';
  let { data, children } = $props();

  const nav = $derived([
    { href: '/queue', label: 'Queue', count: data.counts.queue },
    { href: '/questions', label: 'Questions', count: data.counts.questions },
    { href: '/mappings', label: 'Rules', count: data.counts.rules },
    { href: '/evals', label: 'Evals' },
    { href: '/ledgers', label: 'Ledgers' },
    { href: '/system', label: 'System' },
    { href: '/settings', label: 'Settings' },
    ...(data.me?.role === 'owner' ? [{ href: '/settings/members', label: 'Members' }] : [])
  ]);

  async function switchOrg(id: string) {
    try { await call('org.select', { id }); await invalidateAll(); } catch (e) { ui.toast((e as Error).message, { kind: 'error' }); }
  }

  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.paletteOpen = !ui.paletteOpen; }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <nav aria-label="Main">
    <a class="brand" href="/queue">LaceLuxx Books</a>
    {#if data.orgs.length > 1}
      <select class="orgsel" aria-label="Company" value={data.me?.orgId} onchange={(ev) => switchOrg(ev.currentTarget.value)}>
        {#each data.orgs as o}<option value={o.id}>{o.name}</option>{/each}
      </select>
    {:else if data.me}<span class="orgname">{data.me.orgName}</span>{/if}
    {#each nav as item}
      <a href={item.href} class:on={page.url.pathname === item.href || (page.url.pathname.startsWith(item.href + '/') && !nav.some((n) => n.href !== item.href && n.href.startsWith(item.href) && page.url.pathname.startsWith(n.href)))} aria-current={page.url.pathname.startsWith(item.href) ? 'page' : undefined}>
        <span>{item.label}</span>{#if item.count}<span class="count">{item.count}</span>{/if}
      </a>
    {/each}
    <button class="btn sm palette-btn" type="button" onclick={() => (ui.paletteOpen = true)}>⌘K Commands</button>
    {#if data.settings}
      <div class="status">
        Slash: {data.settings.slashMode}<br />QuickBooks: {data.settings.qboMode}<br />Model: {data.settings.modelMode} · shadow mode
        {#if data.settings.devBypass}<br /><span class="warn">Dev bypass: owner@local</span>{/if}
        {#if data.me}<br /><span class="me">{data.me.email} · {data.me.role}</span>{#if data.me.via === 'google'} · <form method="POST" action="/logout" class="inline"><button class="linkbtn" type="submit">Sign out</button></form>{/if}{/if}
      </div>
    {/if}
  </nav>
  <main aria-busy={!!navigating.to}>
    {#if navigating.to}<div class="progress" aria-hidden="true"></div>{/if}
    {@render children()}
  </main>
</div>
<Palette />
<Toasts />

<style>
  .shell { display: flex; flex-wrap: wrap; min-height: 100vh; }
  nav { flex: 1 1 200px; max-width: 220px; padding: 20px 12px; display: flex; flex-direction: column; gap: 4px; background: var(--surface); border-right: 1px solid var(--line); }
  .brand { padding: 4px 10px 16px; font-weight: 600; font-size: 15px; color: var(--ink); text-decoration: none; }
  nav a:not(.brand) { display: flex; justify-content: space-between; padding: 9px 10px; border-radius: 6px; color: var(--ink-2); text-decoration: none; }
  nav a.on { background: var(--accent-soft); color: var(--accent-ink); font-weight: 500; }
  .count { font-variant-numeric: tabular-nums; }
  .palette-btn { margin-top: 12px; justify-content: center; }
  .status { margin-top: auto; padding: 10px; font-size: 12px; color: var(--muted); line-height: 1.5; }
  .warn { color: var(--warn); }
  .orgsel { margin: 0 0 8px; height: 30px; border: 1px solid var(--line-strong); border-radius: 6px; padding: 0 6px; font: inherit; font-size: 13px; background: var(--surface); }
  .orgname { display: block; margin: -6px 0 10px; font-size: 12px; color: var(--muted); }
  .inline { display: inline; }
  .linkbtn { border: 0; background: none; padding: 0; color: var(--accent, #1d4ed8); font: inherit; cursor: pointer; text-decoration: underline; }
  main { flex: 999 1 560px; min-width: 0; padding: 24px 32px; position: relative; }
  .progress { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--accent); animation: pulse 1s infinite; }
  @media (max-width: 720px) {
    nav { max-width: none; flex-direction: row; flex-wrap: wrap; border-right: 0; border-bottom: 1px solid var(--line); }
    .status, .palette-btn { display: none; }
    main { padding: 16px; }
  }
</style>
