<script lang="ts">
  // Lazy-loaded on /system only. Deterministic lane layout: one column per layer, so the
  // picture is stable between loads (no force layout jitter). Opens anchored top-left at a readable
  // zoom (Front-end → AI in view); pan right for tables, tools and external systems.
  import { SvelteFlow, Background, Controls, MiniMap, type Node, type Edge } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import type { SystemGraph } from '$lib/types';
  import { friendly, LANE_NAMES } from '$lib/names';

  let { graph, selected = $bindable(null), filter = 'all', showViews = false }: { graph: SystemGraph; selected?: string | null; filter?: string; showViews?: boolean } = $props();
  // Read-only view processes (list/show screens) are noise in the topology; hidden unless asked for.
  const isView = (id: string) => /^FE\.[a-z]+\.(list|show|graph)$/.test(id);

  const LANES = ['FE', 'MW', 'AI', 'IN', 'BE', 'TOOLS', 'EXT'] as const;
  const LANE_NAME = LANE_NAMES;
  const COL_W = 230;
  const ROW_H = 54;
  // Back-end is two columns wide (21 tables), so lanes after it shift right by one column.
  const WIDE = 'BE';
  const laneX = (i: number) => (i + (i > LANES.indexOf(WIDE) ? 1 : 0)) * COL_W;

  const visible = $derived(new Set(graph.nodes.filter((n) => (showViews || !isView(n.id) || n.id === selected) && (filter === 'all' || n.kind === filter || n.id === selected)).map((n) => n.id)));

  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);
  $effect(() => {
    const perLane = new Map<string, number>();
    const ns: Node[] = LANES.map((l, i) => ({
      id: `lane:${l}`, position: { x: laneX(i), y: -50 }, data: { label: LANE_NAME[l] }, draggable: false, selectable: false,
      class: 'lane-label', style: `width:${(l === WIDE ? 2 : 1) * COL_W - 30}px;`
    }));
    for (const n of graph.nodes) {
      if (!visible.has(n.id)) continue;
      const lane = LANES.indexOf(n.layer as (typeof LANES)[number]);
      const row = perLane.get(n.layer) ?? 0;
      perLane.set(n.layer, row + 1);
      ns.push({
        id: n.id,
        position: n.layer === WIDE ? { x: laneX(lane) + (row % 2) * COL_W, y: Math.floor(row / 2) * ROW_H } : { x: laneX(lane), y: row * ROW_H },
        data: { label: n.kind === 'table' || n.kind === 'external' ? n.label.replace(/^table:|^ext:/, '') : friendly(n.id) },
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
  <SvelteFlow bind:nodes bind:edges initialViewport={{ x: 24, y: 64, zoom: 0.8 }} minZoom={0.2} nodesConnectable={false} onnodeclick={({ node }) => { if (!node.id.startsWith('lane:')) selected = node.id; }} onpaneclick={() => (selected = null)}>
    <Background gap={24} />
    <Controls showLock={false} position="top-right" />
    <MiniMap pannable zoomable position="bottom-right" />
  </SvelteFlow>
</div>

<style>
  .wrap { height: 100%; min-height: 520px; --xy-background-color: transparent; --xy-edge-stroke: var(--hair-strong); }
  .wrap :global(.svelte-flow) { background: transparent; }
  .wrap :global(.svelte-flow__node.node) { font-family: var(--sans); font-size: 12.5px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--hair-strong); background: var(--raised); color: var(--text); text-align: left; transition: box-shadow var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease); }
  .wrap :global(.svelte-flow__node.node:hover) { border-color: var(--text-muted); }
  .wrap :global(.svelte-flow__node.lane-label) { border: 0; background: transparent; font-family: var(--sans); font-size: 12.5px; font-weight: 500; color: var(--text-muted); box-shadow: none; }
  .wrap :global(.k-agent) { background: linear-gradient(135deg, rgb(110 124 255 / .22), rgb(165 107 255 / .14)) !important; border-color: var(--accent-solid) !important; color: var(--text) !important; }
  .wrap :global(.k-tool) { border-color: color-mix(in srgb, var(--violet) 45%, transparent) !important; color: var(--violet) !important; }
  .wrap :global(.k-human) { border-style: dashed !important; }
  .wrap :global(.k-table) { background: var(--sunken) !important; color: var(--text-2) !important; font-family: var(--mono) !important; font-size: 12px !important; }
  .wrap :global(.k-external) { background: var(--panel) !important; font-family: var(--sans) !important; font-weight: 500; }
  .wrap :global(.s-off) { background: var(--sunken) !important; border-color: var(--hair) !important; color: var(--text-muted) !important; text-decoration: line-through; opacity: .6; }
  .wrap :global(.s-degraded) { border-color: var(--danger) !important; box-shadow: 0 0 0 2px var(--danger-soft); }
  .wrap :global(.s-idle) { opacity: .8; }
  .wrap :global(.sel) { box-shadow: 0 0 0 2px var(--accent-solid) !important; }
  .wrap :global(.edge .svelte-flow__edge-path) { stroke: var(--hair-strong); stroke-width: 1; }
  .wrap :global(.e-writes .svelte-flow__edge-path) { stroke-dasharray: 4 3; }
  .wrap :global(.edge.hot .svelte-flow__edge-path) { stroke: var(--accent-solid); stroke-width: 2; }
  .wrap :global(.svelte-flow__handle) { opacity: 0; }
  .wrap :global(.svelte-flow__controls) { box-shadow: var(--shadow-2); border: 1px solid var(--hair-strong); border-radius: 8px; overflow: hidden; }
  .wrap :global(.svelte-flow__controls-button) { background: var(--raised); color: var(--text); border-bottom: 1px solid var(--hair); fill: currentColor; }
  .wrap :global(.svelte-flow__controls-button:hover) { background: var(--overlay); }
  .wrap :global(.svelte-flow__minimap) { background: var(--sunken); border: 1px solid var(--hair); border-radius: 8px; overflow: hidden; }
  .wrap :global(.svelte-flow__minimap-mask) { fill: rgb(10 14 23 / .6); }
  .wrap :global(.svelte-flow__minimap-node) { fill: var(--overlay); }
  .wrap :global(.svelte-flow__attribution) { background: transparent; color: var(--text-muted); }
  .wrap :global(.svelte-flow__attribution a) { color: var(--text-muted); }
  .wrap :global(.svelte-flow__background pattern circle) { fill: var(--hair-strong); }
</style>
