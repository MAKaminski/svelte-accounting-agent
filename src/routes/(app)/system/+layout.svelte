<script lang="ts">
  import { page } from '$app/state';
  let { children } = $props();
  const tabs = [
    { href: '/system', label: 'Graph', exact: true },
    { href: '/system/agents', label: 'Agents & processes' },
    { href: '/system/tools', label: 'Tools' }
  ];
  const on = (t: (typeof tabs)[number]) => (t.exact ? page.url.pathname === t.href : page.url.pathname.startsWith(t.href));
</script>

<header>
  <h1>System</h1>
  <nav aria-label="System views">
    {#each tabs as t}<a href={t.href} class="chip" class:on={on(t)} aria-current={on(t) ? 'page' : undefined}>{t.label}</a>{/each}
  </nav>
</header>
{@render children()}

<style>
  header { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
  h1 { margin: 0; font-size: 22px; }
  nav { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; text-decoration: none; }
</style>
