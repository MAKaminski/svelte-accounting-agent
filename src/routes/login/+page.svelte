<script lang="ts">
  let { data } = $props();
  const messages: Record<string, string> = $derived({
    AccessDenied: data.signupOpen ? 'Google did not confirm this email address. Use a verified Google account.' : "This Google account isn't invited to any company. Ask an owner to invite it.",
    Configuration: 'Sign-in is not configured on this server (missing Google credentials).'
  });
</script>
<svelte:head><title>Sign in · Accounting Agent</title></svelte:head>
<main class="login">
  <div class="stack">
    <div class="intro">
      <span class="mark" aria-hidden="true">A</span>
      <h1>Accounting Agent</h1>
      <p>It codes your transactions, shows its reasoning, and waits for your approval.</p>
    </div>
    <form method="POST" class="panel">
      <input type="hidden" name="providerId" value="google" />
      <input type="hidden" name="redirectTo" value={data.next} />
      <button class="google" type="submit">
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M17.640 9.200c0-.640-.060-1.250-.160-1.840H9v3.480h4.840a4.140 4.140 0 0 1-1.800 2.720v2.260h2.920c1.700-1.570 2.680-3.880 2.680-6.620z"/><path fill="#34A853" d="M9 18c2.430 0 4.470-.800 5.960-2.180l-2.920-2.260c-.800.540-1.840.860-3.040.860-2.340 0-4.330-1.580-5.040-3.710H.960v2.330A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.960 10.710a5.410 5.410 0 0 1 0-3.420V4.960H.960a9 9 0 0 0 0 8.080l3-2.330z"/><path fill="#EA4335" d="M9 3.580c1.320 0 2.500.450 3.440 1.350l2.580-2.580C13.460.890 11.430 0 9 0A9 9 0 0 0 .960 4.960l3 2.330C4.670 5.160 6.660 3.580 9 3.580z"/></svg>
        Continue with Google
      </button>
      {#if data.signupOpen}
        <p class="muted small">New here? Sign in with any Google account, then create your company. Free to try with demo data.</p>
      {:else}
        <p class="muted small">Invite only. An owner adds your Google email under Settings, Members.</p>
      {/if}
    </form>
    {#if data.error}<p class="err" role="alert">{messages[data.error] ?? 'Sign-in failed. Try again.'}</p>{/if}
  </div>
</main>
<style>
  .login { min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: radial-gradient(900px 520px at 50% 18%, rgb(110 124 255 / .20), transparent 70%), radial-gradient(700px 420px at 72% 80%, rgb(165 107 255 / .12), transparent 70%), var(--page); }
  .stack { width: min(400px, 100%); display: flex; flex-direction: column; gap: 22px; }
  .intro { display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center; }
  .mark { width: 44px; height: 44px; border-radius: 12px; background: var(--grad); display: grid; place-items: center; font-size: 20px; font-weight: 700; color: #fff; box-shadow: var(--glow); }
  h1 { margin: 0; font-size: 26px; }
  .intro p { margin: 0; color: var(--text-2); font-size: 15px; }
  .panel { background: color-mix(in srgb, var(--panel) 88%, transparent); border: 1px solid var(--hair); border-radius: var(--r-2); padding: 22px; display: flex; flex-direction: column; gap: 14px; box-shadow: var(--shadow-2); backdrop-filter: blur(8px); }
  .google { height: 44px; border: 0; border-radius: var(--r-1); background: #F4F6FB; color: #0A0E17; font: inherit; font-size: 14.5px; font-weight: 500; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: filter var(--t-fast) var(--ease), transform var(--t-fast) var(--ease); }
  .google:hover { filter: brightness(.94); } .google:active { transform: translateY(1px); }
  :global(:root[data-theme='light']) .google { background: #fff; border: 1px solid var(--hair-strong); }
  .err { margin: 0; padding: 12px 14px; border-radius: var(--r-2); background: var(--danger-soft); border: 1px solid var(--danger-line); color: var(--danger); font-size: 13px; line-height: 1.45; }
  .small { font-size: 12.5px; margin: 0; text-align: center; }
</style>
