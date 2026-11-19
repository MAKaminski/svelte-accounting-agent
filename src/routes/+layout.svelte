<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>
<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
</svelte:head>
{@render children()}
