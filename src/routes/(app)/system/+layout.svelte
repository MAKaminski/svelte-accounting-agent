<script lang="ts">
  import { page } from '$app/state';
  let { children } = $props();
  const tabs = [
    { href: '/system', label: 'Map', exact: true },
    { href: '/system/agents', label: 'Agents and rules' },
    { href: '/system/tools', label: 'Tools' }
  ];
  const on = (t: (typeof tabs)[number]) => (t.exact ? page.url.pathname === t.href : page.url.pathname.startsWith(t.href));
</script>

<header class="page-head">
  <div><h1>System</h1><p class="sub">Every agent, rule and tool the product runs, and whether it is on.</p></div>
  <nav class="actions" aria-label="System views">
    {#each tabs as t}<a href={t.href} class="chip" class:on={on(t)} aria-current={on(t) ? 'page' : undefined}>{t.label}</a>{/each}
  </nav>
</header>
{@render children()}

<style>
  nav { flex-wrap: wrap; }
</style>
