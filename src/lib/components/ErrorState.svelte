<script lang="ts">
  import { sourceLabel } from '$lib/client';
  let { message, source = 'app', onretry }: { message: string; source?: string; onretry?: () => void } = $props();
</script>
<div class="err card" role="alert">
  <div class="head"><span class="badge {source}">{(sourceLabel[source] ?? source).toUpperCase()}</span><strong>Something failed</strong></div>
  <code>{message}</code>
  {#if onretry}<button class="btn" type="button" onclick={onretry}>Retry</button>{/if}
</div>
<style>
  .err { border-color: var(--danger-line); padding: 20px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
  .head { display: flex; gap: 8px; align-items: center; }
  code { font-family: var(--mono); font-size: 12px; color: var(--danger); background: var(--danger-soft); padding: 10px; border-radius: 6px; align-self: stretch; white-space: pre-wrap; }
</style>
