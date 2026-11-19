<script lang="ts">
  let { form } = $props();
</script>
<main class="login">
  <form method="POST">
    <h1>LaceLuxx Books</h1>
    <label>Passcode <input name="passcode" type="password" autocomplete="current-password" required /></label>
    {#if form?.error}<p class="err" role="alert">{form.error}</p>{/if}
    <button class="btn primary" type="submit">Sign in</button>
  </form>
</main>
<style>
  .login { min-height: 100vh; display: grid; place-items: center; background: var(--bg); }
  form { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 32px; display: flex; flex-direction: column; gap: 14px; width: 320px; }
  h1 { margin: 0; font-size: 18px; }
  label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
  input { height: 36px; border: 1px solid var(--line-strong); border-radius: 6px; padding: 0 10px; font: inherit; }
  .err { color: var(--danger); margin: 0; }
</style>
