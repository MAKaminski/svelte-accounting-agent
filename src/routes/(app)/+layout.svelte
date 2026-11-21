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

  // Icons: 16 px stroke paths, one per destination.
  const icons: Record<string, string> = {
    '/queue': 'M3 4h10M3 8h10M3 12h6',
    '/questions': 'M6.2 6a1.9 1.9 0 1 1 2.6 1.8c-.5.3-.8.7-.8 1.2M8 11.6v.1M2.5 8a5.5 5.5 0 1 0 11 0 5.5 5.5 0 0 0-11 0',
    '/mappings': 'M3 4.5h4l2 7h4M11 9.5l2 2-2 2',
    '/evals': 'M3 12.5V8.5M6.5 12.5v-7M10 12.5V7M13.5 12.5V3.5',
    '/ledgers': 'M2.5 5.5h11v7h-11zM2.5 8h11M5 3.5h6',
    '/system': 'M3.5 3.5h3v3h-3zM9.5 9.5h3v3h-3zM6.5 5h3.5v4.5M3.5 9.5h3v3h-3z',
    '/settings': 'M3 5h6M11.5 5H13M3 11h1.5M7 11h6M9 5a1.25 1.25 0 1 0 2.5 0A1.25 1.25 0 0 0 9 5M4.5 11A1.25 1.25 0 1 0 7 11a1.25 1.25 0 0 0-2.5 0',
    '/settings/members': 'M6 7.5a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5M2 13c.4-2 2-3 4-3s3.600 1 4 3M10.500 7a1.900 1.900 0 1 0 0-3.800M11.500 10c1.500.300 2.300 1.200 2.500 2.600'
  };
  const initials = (s: string) => s.split(/[@\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  let theme = $state<'dark' | 'light'>('dark');
  $effect(() => { theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; });
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch { /* private mode */ }
  }
  const isOn = (href: string) => (href === '/queue' && page.url.pathname.startsWith('/entry/')) || page.url.pathname === href || (page.url.pathname.startsWith(href + '/') && !nav.some((n) => n.href !== href && n.href.startsWith(href) && page.url.pathname.startsWith(n.href)));

  function onKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ui.paletteOpen = !ui.paletteOpen; }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <nav aria-label="Main">
    <a class="brand" href="/queue"><span class="mark" aria-hidden="true">A</span>Accounting Agent</a>
    {#if data.orgs.length > 1}
      <select class="orgsel" aria-label="Company" value={data.me?.orgId} onchange={(ev) => switchOrg(ev.currentTarget.value)}>
        {#each data.orgs as o}<option value={o.id}>{o.name}</option>{/each}
      </select>
    {:else if data.me}<span class="orgname">{data.me.orgName}</span>{/if}
    {#each nav as item}
      <a class="item" href={item.href} class:on={isOn(item.href)} aria-current={isOn(item.href) ? 'page' : undefined}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icons[item.href]} /></svg>
        <span>{item.label}</span>{#if item.count}<span class="count">{item.count}</span>{/if}
      </a>
    {/each}
    <button class="palette-btn" type="button" onclick={() => (ui.paletteOpen = true)}><span>Search or run a command</span><span class="kbd">⌘K</span></button>
    <div class="foot">
      {#if data.settings}
        <div class="modes">
          <span title="Where transactions and model answers come from">Slash {data.settings.slashMode}, QuickBooks {data.settings.qboMode}, model {data.settings.modelMode}</span>
          {#if data.settings.devBypass}<span class="warn">Dev bypass: owner@local</span>{/if}
        </div>
      {/if}
      {#if data.me}
        <div class="me">
          <span class="avatar" aria-hidden="true">{initials(data.me.name ?? data.me.email)}</span>
          <div class="who"><span class="email">{data.me.email}</span><span class="role">{data.me.role}</span></div>
          <button class="iconbtn" type="button" onclick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
              {#if theme === 'dark'}<path d="M8 2v1.500M8 12.500V14M2 8h1.500M12.500 8H14M3.800 3.800l1 1M11.200 11.200l1 1M3.800 12.200l1-1M11.200 4.800l1-1M8 10.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5" />{:else}<path d="M13 9.500A5.500 5.500 0 0 1 6.500 3a5.500 5.500 0 1 0 6.500 6.500" />{/if}
            </svg>
          </button>
          {#if data.me.via === 'google'}
            <form method="POST" action="/logout"><button class="iconbtn" type="submit" aria-label="Sign out" title="Sign out"><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.500 2.500h-3v11h3M10 5l3 3-3 3M6.500 8H13" /></svg></button></form>
          {/if}
        </div>
      {/if}
    </div>
  </nav>
  <main aria-busy={!!navigating.to}>
    {#if navigating.to}<div class="progress" aria-hidden="true"></div>{/if}
    <div class="content">{@render children()}</div>
  </main>
</div>
<Palette />
<Toasts />

<style>
  .shell { display: flex; min-height: 100vh; }
  nav { width: 236px; flex-shrink: 0; position: sticky; top: 0; height: 100vh; padding: 18px 12px 12px; display: flex; flex-direction: column; gap: 2px; background: var(--sunken); border-right: 1px solid var(--hair); }
  .brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 16px; font-weight: 600; font-size: 15px; color: var(--text); text-decoration: none; }
  .mark { width: 26px; height: 26px; border-radius: 8px; background: var(--grad); display: grid; place-items: center; font-size: 13px; font-weight: 700; color: #fff; box-shadow: var(--glow); }
  .item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--r-1); color: var(--text-2); text-decoration: none; font-size: 13.5px; transition: background var(--t-fast) var(--ease), color var(--t-fast) var(--ease); }
  .item:hover { background: var(--hair-soft); color: var(--text); }
  .item.on { background: var(--accent-tint); color: var(--text); box-shadow: inset 2px 0 0 var(--accent-solid); font-weight: 500; }
  .item.on svg { color: var(--accent-solid); }
  .count { margin-left: auto; font-size: 12px; padding: 1px 7px; border-radius: 10px; background: var(--hair); color: var(--text-2); font-variant-numeric: tabular-nums; }
  .palette-btn { margin-top: 14px; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--r-1); border: 1px solid var(--hair); background: transparent; color: var(--text-muted); font: inherit; font-size: 13px; cursor: pointer; text-align: left; }
  .palette-btn:hover { border-color: var(--hair-strong); color: var(--text); }
  .orgsel { margin: 0 0 12px; height: 34px; padding: 0 8px; font-size: 13px; background: var(--panel); border-color: var(--hair); }
  .orgname { display: block; margin: -8px 0 12px; padding: 0 8px; font-size: 12.5px; color: var(--text-muted); }
  .foot { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
  .modes { padding: 0 10px; font-size: 12px; color: var(--text-muted); display: flex; flex-direction: column; gap: 2px; }
  .warn { color: var(--warn); }
  .me { display: flex; align-items: center; gap: 10px; padding: 10px 6px 0 8px; border-top: 1px solid var(--hair); }
  .who { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .email { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .role { font-size: 12px; color: var(--text-muted); text-transform: capitalize; }
  .iconbtn { width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; }
  .iconbtn:hover { background: var(--hair); color: var(--text); }
  main { flex: 1; min-width: 0; position: relative; }
  .content { max-width: 1320px; margin: 0 auto; padding: 28px 36px 64px; }
  .progress { position: absolute; top: 0; left: 0; right: 0; height: 2px; background: var(--grad); animation: pulse 1s infinite; }
  @media (max-width: 820px) {
    .shell { flex-direction: column; }
    nav { width: auto; height: auto; position: static; flex-direction: row; flex-wrap: wrap; align-items: center; border-right: 0; border-bottom: 1px solid var(--hair); padding: 10px 12px; }
    .brand { padding: 4px 8px; }
    .foot, .palette-btn, .orgname { display: none; }
    .item span:not(.count) { display: none; }
    .item.on span:not(.count) { display: inline; }
    .content { padding: 16px; }
  }
</style>
