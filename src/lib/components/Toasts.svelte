<script lang="ts">
  import { ui } from '$lib/ui.svelte';
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 250); return () => clearInterval(t); });
</script>
<div class="toasts" role="status" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    <div class="toast" class:error={t.kind === 'error'}>
      <span class="dot" aria-hidden="true"></span>
      <span class="msg">{t.text}{#if t.undo && t.until} · sends in {Math.max(0, Math.ceil((t.until - now) / 1000))} s{/if}</span>
      {#if t.undo}
        <button class="btn sm undo" type="button" onclick={async () => { await t.undo!(); ui.dismiss(t.id); }}>Undo <span class="kbd">u</span></button>
      {/if}
      <button class="x" type="button" aria-label="Dismiss" onclick={() => ui.dismiss(t.id)}>×</button>
      {#if t.undo && t.until}<i class="bar" style="width: {Math.max(0, Math.min(100, ((t.until - now) / 10_000) * 100))}%"></i>{/if}
    </div>
  {/each}
</div>
<style>
  .toasts { position: fixed; bottom: 24px; right: 28px; display: flex; flex-direction: column; gap: 8px; z-index: 50; width: min(460px, calc(100vw - 32px)); }
  .toast { position: relative; overflow: hidden; display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: var(--r-2); background: var(--overlay); border: 1px solid var(--hair-strong); color: var(--text); font-size: 13.5px; box-shadow: var(--shadow-3); animation: in var(--t) var(--ease); }
  @keyframes in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); flex-shrink: 0; }
  .toast.error { border-color: var(--danger-line); }
  .toast.error .dot { background: var(--danger); }
  .msg { flex: 1; }
  .x { border: 0; background: transparent; color: var(--text-muted); font-size: 18px; cursor: pointer; width: 28px; height: 28px; border-radius: 6px; }
  .x:hover { background: var(--hair); color: var(--text); }
  .bar { position: absolute; left: 0; bottom: 0; height: 2px; background: linear-gradient(90deg, var(--a1), var(--a2)); transition: width 250ms linear; }
</style>
