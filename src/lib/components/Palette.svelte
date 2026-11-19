<script lang="ts">
  // ⌘K palette: the same verbs as the CLI, generated from the command registry.
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/state';
  import { commands } from '$lib/commands';
  import { call } from '$lib/client';
  import { ui } from '$lib/ui.svelte';

  let q = $state('');
  let idx = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const navItems = [
    { label: 'Go to Queue', hint: 'g q', run: () => goto('/queue') },
    { label: 'Go to Questions', hint: '', run: () => goto('/questions') },
    { label: 'Go to Rules', hint: '', run: () => goto('/mappings') },
    { label: 'Go to Evals', hint: '', run: () => goto('/evals') },
    { label: 'Go to Settings', hint: '', run: () => goto('/settings') }
  ];

  const entryId = $derived(page.params.id ?? ui.selectedId);
  const items = $derived([
    ...navItems,
    ...commands.filter((c) => c.method === 'POST').map((c) => ({
      label: `${c.noun} ${c.verb} — ${c.summary}`,
      hint: c.shortcut ?? '',
      run: async () => {
        const needsId = c.params.some((p) => p.kind === 'positional' && p.name === 'id');
        const needsOther = c.params.some((p) => p.kind === 'positional' && p.name !== 'id');
        if (needsOther || (needsId && !c.path.startsWith('/api/entries/'))) { await goto(c.screen?.replace('[id]', entryId ?? '') ?? '/queue'); return; }
        if (needsId && !entryId) { ui.toast('Select an entry first', { kind: 'error' }); return; }
        if (c.name === 'entry.ask' || c.name === 'entry.reject') { await goto(`/entry/${entryId}`); return; }
        ui.busy = c.name;
        try {
          await call(c.name, { id: entryId, yes: true, later: true, wait: true });
          ui.toast(`${c.noun} ${c.verb} done`);
          await invalidateAll();
        } catch (e) { ui.toast((e as Error).message, { kind: 'error' }); }
        finally { ui.busy = null; }
      }
    }))
  ]);
  const shown = $derived(items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())));

  $effect(() => { if (ui.paletteOpen) { q = ''; idx = 0; queueMicrotask(() => input?.focus()); } });

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') ui.paletteOpen = false;
    else if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, shown.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); e.preventDefault(); }
    else if (e.key === 'Enter' && shown[idx]) { ui.paletteOpen = false; shown[idx].run(); }
  }
</script>

{#if ui.paletteOpen}
  <div class="backdrop" role="presentation" onclick={() => (ui.paletteOpen = false)}></div>
  <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
    <input bind:this={input} bind:value={q} onkeydown={key} placeholder="Type a command…" aria-label="Command" />
    <ul role="listbox">
      {#each shown as item, i}
        <li role="option" aria-selected={i === idx}>
          <button type="button" class:on={i === idx} onmouseenter={() => (idx = i)} onclick={() => { ui.paletteOpen = false; item.run(); }}>
            <span>{item.label}</span>{#if item.hint}<span class="kbd">{item.hint}</span>{/if}
          </button>
        </li>
      {/each}
      {#if !shown.length}<li class="none">No matching command</li>{/if}
    </ul>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / .3); z-index: 40; }
  .palette { position: fixed; top: 12vh; left: 50%; transform: translateX(-50%); width: min(620px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 12px 40px rgb(0 0 0 / .25); z-index: 41; overflow: hidden; }
  input { width: 100%; height: 48px; border: 0; border-bottom: 1px solid var(--line); padding: 0 16px; font-size: 15px; outline: none; }
  ul { list-style: none; margin: 0; padding: 6px; max-height: 50vh; overflow: auto; }
  li button { width: 100%; display: flex; justify-content: space-between; gap: 12px; padding: 9px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  li button.on { background: var(--accent-soft); color: var(--accent-ink); }
  .none { padding: 12px; color: var(--muted); }
</style>
