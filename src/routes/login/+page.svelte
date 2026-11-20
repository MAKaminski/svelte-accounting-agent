<script lang="ts">
  let { data } = $props();
  const messages: Record<string, string> = {
    AccessDenied: "This Google account isn't invited to any company. Ask an owner to invite it.",
    Configuration: 'Sign-in is not configured on this server (missing Google credentials).'
  };
</script>
<main class="login">
  <form method="POST">
    <h1>LaceLuxx Books</h1>
    <input type="hidden" name="providerId" value="google" />
    <input type="hidden" name="redirectTo" value={data.next} />
    <button class="btn google" type="submit">Sign in with Google</button>
    {#if data.error}<p class="err" role="alert">{messages[data.error] ?? 'Sign-in failed. Try again.'}</p>{/if}
    <p class="muted small">Invite-only. An owner adds your Google email under Settings → Members.</p>
  </form>
</main>
<style>
  .login { min-height: 100vh; display: grid; place-items: center; background: var(--bg); }
  form { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 32px; display: flex; flex-direction: column; gap: 14px; width: 340px; }
  h1 { margin: 0; font-size: 18px; }
  .google { height: 40px; border: 1px solid var(--line-strong); border-radius: 6px; background: var(--surface); font: inherit; font-weight: 500; cursor: pointer; }
  .err { margin: 0; padding: 8px 10px; border-radius: 6px; background: #fef2f2; color: var(--danger); font-size: 13px; line-height: 1.45; }
  .small { font-size: 12px; margin: 0; }
</style>
