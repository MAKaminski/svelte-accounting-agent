<script lang="ts">
  import type { Company } from '$lib/types';
  let { steps }: { steps: Company['setup'] } = $props();
  const done = $derived(steps.filter((s) => s.done).length);
  const next = $derived(steps.find((s) => !s.done));
</script>
{#if next}
  <section class="card setup" aria-label="Setup checklist">
    <div class="head">
      <h2>Get set up</h2>
      <span class="muted small">{done} of {steps.length} done</span>
      <div class="meter" aria-hidden="true"><span style="width: {(done / steps.length) * 100}%"></span></div>
    </div>
    <ol>
      {#each steps as s, i (s.id)}
        <li class:done={s.done} class:next={s === next}>
          <span class="dot" aria-hidden="true">{s.done ? '✓' : i + 1}</span>
          {#if s.done}<span>{s.label}</span>{:else}<a href={s.href}>{s.label}</a>{/if}
          {#if s === next}<a class="btn sm primary go" href={s.href}>Start</a>{/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}
<style>
  .setup { padding: 18px 22px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 15px; }
  .meter { flex: 1; min-width: 120px; height: 6px; border-radius: 99px; background: var(--sunken); overflow: hidden; }
  .meter span { display: block; height: 100%; background: var(--grad); }
  ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  li { display: flex; align-items: center; gap: 10px; font-size: 13.5px; min-height: 30px; }
  li.done { color: var(--text-muted); }
  li.next { font-weight: 500; }
  .dot { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 11.5px; border: 1px solid var(--hair-strong); flex-shrink: 0; }
  li.done .dot { background: var(--ok-soft); color: var(--ok); border-color: transparent; }
  li.next .dot { background: var(--accent-soft); color: var(--accent-ink); border-color: transparent; }
  .go { margin-left: auto; }
  .small { font-size: 12.5px; }
</style>
