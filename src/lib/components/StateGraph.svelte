<script lang="ts">
  // Live entry-state machine: node = state with its current item count; edge = transition labelled with
  // the process that causes it. Transitions owned by the selected component are highlighted.
  let { counts, transitions }: { counts: Record<string, number>; transitions: { from: string; to: string; by: string; mine: boolean }[] } = $props();

  const POS: Record<string, [number, number]> = {
    start: [30, 150], fetched: [130, 150], researched: [270, 150], recommended: [430, 150], invalid: [430, 40], asked: [430, 262],
    approved: [600, 150], coded: [740, 150], ready: [860, 150], synced: [980, 150], rejected: [600, 262]
  };
  const W = 96, H = 40;
  const edgePath = (a: string, b: string, i: number) => {
    const [x1, y1] = POS[a]; const [x2, y2] = POS[b];
    const back = x2 < x1 || (x2 === x1 && y2 < y1);
    const bend = back ? 36 + (i % 2) * 14 : 0;
    const sx = x1 + W / 2, sy = y1 + H / 2, ex = x2 + W / 2, ey = y2 + H / 2;
    const mx = (sx + ex) / 2, my = (sy + ey) / 2 + (back ? bend : 0);
    return { d: `M${sx},${sy} Q${mx},${my + (back ? bend : 0)} ${ex},${ey}`, lx: mx, ly: my + (back ? bend : -4) };
  };
  const short = (p: string) => p.split('.').slice(1).join('.');
</script>

<svg viewBox="0 0 1100 320" role="img" aria-label="Entry state graph with live counts">
  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" /></marker></defs>
  {#each transitions as t, i}
    {@const p = edgePath(t.from, t.to, i)}
    <g class="edge" class:mine={t.mine}>
      <path d={p.d} fill="none" marker-end="url(#arr)" />
      {#if t.mine}<text x={p.lx} y={p.ly} text-anchor="middle">{short(t.by)}</text>{/if}
    </g>
  {/each}
  {#each Object.entries(POS) as [s, [x, y]]}
    <g class="state" class:has={(counts[s] ?? 0) > 0}>
      {#if s === 'start'}
        <circle cx={x + W / 2} cy={y + H / 2} r="8" />
      {:else}
        <rect {x} {y} width={W} height={H} rx="6" />
        <text x={x + W / 2} y={y + 17} text-anchor="middle" class="name">{s}</text>
        <text x={x + W / 2} y={y + 32} text-anchor="middle" class="n">{counts[s] ?? 0}</text>
      {/if}
    </g>
  {/each}
</svg>

<style>
  svg { width: 100%; height: auto; color: var(--line-strong); font-family: Inter, system-ui, sans-serif; }
  .edge path { stroke: var(--line-strong); stroke-width: 1.2; }
  .edge.mine { color: var(--accent); } .edge.mine path { stroke: var(--accent); stroke-width: 2.2; }
  .edge text { font-size: 10px; fill: var(--accent); font-family: var(--mono); paint-order: stroke; stroke: var(--surface); stroke-width: 4px; }
  .state rect { fill: var(--surface); stroke: var(--line-strong); }
  .state.has rect { fill: var(--accent-soft); stroke: var(--accent); }
  .state circle { fill: var(--ink); }
  .name { font-size: 11px; fill: var(--ink-2); }
  .n { font-size: 13px; font-weight: 600; fill: var(--ink); font-variant-numeric: tabular-nums; }
</style>
