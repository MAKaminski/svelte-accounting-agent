<script lang="ts">
  import { ui } from '$lib/ui.svelte';
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 250); return () => clearInterval(t); });
</script>
<div class="toasts" role="status" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    <div class="toast" class:error={t.kind === 'error'}>
      <span>{t.text}{#if t.undo && t.until} · sends in {Math.max(0, Math.ceil((t.until - now) / 1000))} s{/if}</span>
      {#if t.undo}
        <button class="undo" type="button" onclick={async () => { await t.undo!(); ui.dismiss(t.id); }}>Undo <span class="kbd">u</span></button>
      {/if}
      <button class="x" type="button" aria-label="Dismiss" onclick={() => ui.dismiss(t.id)}>×</button>
    </div>
  {/each}
</div>
<style>
  .toasts { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; z-index: 50; width: min(560px, calc(100vw - 32px)); }
  .toast { display: flex; gap: 12px; align-items: center; padding: 10px 14px; border-radius: 8px; background: #18181b; color: #fff; font-size: 13px; box-shadow: 0 4px 16px rgb(0 0 0 / .2); }
  .toast.error { background: #7f1d1d; }
  .toast span { flex: 1; }
  .undo { height: 28px; padding: 0 10px; border: 1px solid #52525b; border-radius: 6px; background: transparent; color: #fff; font: inherit; cursor: pointer; }
  .x { border: 0; background: transparent; color: #a1a1aa; font-size: 18px; cursor: pointer; width: 28px; height: 28px; }
</style>
