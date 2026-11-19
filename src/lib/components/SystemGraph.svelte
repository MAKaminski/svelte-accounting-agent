<script lang="ts">
  // Lazy-loaded on /system only. Deterministic lane layout: one column per layer, so the
  // picture is stable between loads (no force layout jitter).
  import { SvelteFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import type { SystemGraph } from '$lib/types';

  let { graph, selected = $bindable(null), filter = 'all', showViews = false }: { graph: SystemGraph; selected?: string | null; filter?: string; showViews?: boolean } = $props();
  // Read-only view processes (list/show screens) are noise in the topology; hidden unless asked for.
  const isView = (id: string) => /^FE\.[a-z]+\.(list|show|graph)$/.test(id);

  const LANES = ['FE', 'MW', 'AI', 'IN', 'BE', 'TOOLS', 'EXT'] as const;
  const LANE_NAME: Record<string, string> = { FE: 'Front-end', MW: 'Middleware', AI: 'AI', IN: 'Infra', BE: 'Back-end (tables)', TOOLS: 'Tools', EXT: 'External' };
  const COL_W = 230;
  const ROW_H = 54;

  const visible = $derived(new Set(graph.nodes.filter((n) => (showViews || !isView(n.id) || n.id === selected) && (filter === 'all' || n.kind === filter || n.id === selected)).map((n) => n.id)));

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    const perLane = new Map<string, number>();
    const ns: Node[] = LANES.map((l, i) => ({
      id: `lane:${l}`, position: { x: i * COL_W, y: -50 }, data: { label: LANE_NAME[l] }, draggable: false, selectable: false,
      class: 'lane-label', style: `width:${COL_W - 30}px;`
    }));
    for (const n of graph.nodes) {
      if (!visible.has(n.id)) continue;
      const lane = LANES.indexOf(n.layer as (typeof LANES)[number]);
      const row = perLane.get(n.layer) ?? 0;
      perLane.set(n.layer, row + 1);
      ns.push({
        id: n.id, position: { x: lane * COL_W, y: row * ROW_H },
        data: { label: n.label.replace(/^table:|^ext:/, '') },
        class: `node k-${n.kind} s-${n.status}${selected === n.id ? ' sel' : ''}`,
        style: `width:${COL_W - 30}px;`
      });
    }
    nodes = ns;
    const hot = selected;
    edges = graph.edges.filter((e) => visible.has(e.source) && visible.has(e.target)).map((e) => ({
      id: e.id, source: e.source, target: e.target,
      class: `edge e-${e.kind}${hot && (e.source === hot || e.target === hot) ? ' hot' : ''}`,
      animated: !!hot && (e.source === hot || e.target === hot) && e.kind === 'flow'
    }));
  });
</script>

<div class="wrap" role="region" aria-label="Component graph">
  <SvelteFlow bind:nodes bind:edges fitView fitViewOptions={{ minZoom: 0.75, maxZoom: 1.1, padding: 0.05 }} minZoom={0.2} nodesConnectable={false} onnodeclick={({ node }) => { if (!node.id.startsWith('lane:')) selected = node.id; }} onpaneclick={() => (selected = null)}>
    <Background gap={24} />
    <Controls showLock={false} position="top-left" />
    <MiniMap pannable zoomable position="bottom-right" />
  </SvelteFlow>
</div>

<style>
  .wrap { height: 100%; min-height: 520px; }
  .wrap :global(.svelte-flow__node.node) { font-family: var(--mono); font-size: 12px; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); text-align: left; }
  .wrap :global(.svelte-flow__node.lane-label) { border: 0; background: transparent; font-family: Inter, system-ui, sans-serif; font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; box-shadow: none; }
  .wrap :global(.k-agent) { background: #eff6ff !important; border-color: #93c5fd !important; color: #1e3a8a !important; }
  .wrap :global(.k-tool) { background: #f5f3ff !important; border-color: #c4b5fd !important; color: #5b21b6 !important; }
  .wrap :global(.k-human) { border-style: dashed !important; }
  .wrap :global(.k-table) { background: var(--muted-surface) !important; color: var(--ink-2) !important; }
  .wrap :global(.k-external) { background: var(--line-soft) !important; font-family: Inter, system-ui, sans-serif !important; font-weight: 500; }
  .wrap :global(.s-off) { background: var(--muted-surface) !important; border-color: var(--line) !important; color: #a1a1aa !important; text-decoration: line-through; }
  .wrap :global(.s-degraded) { border-color: var(--danger) !important; box-shadow: 0 0 0 2px var(--danger-soft); }
  .wrap :global(.s-idle) { opacity: .75; }
  .wrap :global(.sel) { box-shadow: 0 0 0 2px var(--accent) !important; }
  .wrap :global(.edge .svelte-flow__edge-path) { stroke: var(--line-strong); stroke-width: 1; }
  .wrap :global(.e-writes .svelte-flow__edge-path) { stroke-dasharray: 4 3; }
  .wrap :global(.edge.hot .svelte-flow__edge-path) { stroke: var(--accent); stroke-width: 2; }
</style>
