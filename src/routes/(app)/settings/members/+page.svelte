<script lang="ts">
  import { invalidate } from '$app/navigation';
  import { page } from '$app/state';
  import { call } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import ErrorState from '$lib/components/ErrorState.svelte';
  import type { Member, ApiToken } from '$lib/types';
  let { data } = $props();

  let email = $state('');
  let role = $state<'reviewer' | 'viewer' | 'owner'>('reviewer');
  let tokenName = $state('');
  let newToken = $state<(ApiToken & { token: string }) | null>(null);
  let busy = $state<string | null>(null);
  let confirming = $state<{ kind: 'member' | 'token'; id: string; label: string } | null>(null);

  const people = $derived(data.members.filter((m) => m.kind === 'member').length);
  const pending = $derived(data.members.filter((m) => m.kind === 'invite').length);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    busy = key;
    try { await fn(); ui.toast(ok); await invalidate('app:members'); }
    catch (e) { ui.toast((e as Error).message, { kind: 'error', ms: 6000 }); }
    finally { busy = null; }
  }
  const invite = () => run('invite', async () => { await call('member.invite', { email, role }); email = ''; }, `Invited ${email}. They sign in with Google to accept.`);
  const changeRole = (m: Member, r: string) => run(`role:${m.id}`, () => call('member.role', { id: m.id, role: r }), `${m.email} is now ${r}`);
  async function createToken() {
    busy = 'token';
    try { newToken = await call<ApiToken & { token: string }>('token.create', { name: tokenName }); tokenName = ''; await invalidate('app:members'); }
    catch (e) { ui.toast((e as Error).message, { kind: 'error' }); } finally { busy = null; }
  }
  async function confirm() {
    const c = confirming!;
    confirming = null;
    if (c.kind === 'member') await run(`rm:${c.id}`, () => call('member.remove', { id: c.id, yes: true }), `Removed ${c.label}`);
    else await run(`rv:${c.id}`, () => call('token.revoke', { id: c.id, yes: true }), `Revoked "${c.label}"`);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(newToken!.token); ui.toast('Token copied'); } catch { ui.toast('Copy failed — select and copy it manually', { kind: 'error' }); }
  }
</script>

<svelte:head><title>Members · LaceLuxx Books</title></svelte:head>
<header class="head">
  <h1>Members</h1>
  <span class="muted">{page.data.me?.orgName} · {people} member{people === 1 ? '' : 's'}{pending ? ` · ${pending} invite${pending === 1 ? '' : 's'} pending` : ''}</span>
</header>

{#if data.error}
  <ErrorState message={data.error} onretry={() => invalidate('app:members')} />
{:else}
  <div class="layout">
    <div class="main">
      <section class="card" aria-label="Members">
        <div class="row th"><span>Person</span><span>Role</span><span>Last seen</span><span class="r">Actions</span></div>
        {#each data.members as m (m.id)}
          <div class="row">
            <div class="who">
              <strong>{m.kind === 'invite' ? 'Invite pending' : (m.name ?? m.email)}</strong>
              <span class="muted small">{m.email}</span>
            </div>
            <select aria-label="Role for {m.email}" value={m.role} disabled={!!busy || m.you} onchange={(ev) => changeRole(m, ev.currentTarget.value)}>
              <option value="owner">Owner</option><option value="reviewer">Reviewer</option><option value="viewer">Viewer</option>
            </select>
            <span class="small" class:pend={m.kind === 'invite'}>{m.kind === 'invite' ? `Invited ${when(m.createdAt)}` : m.you ? 'Now' : when(m.lastSeenAt)}</span>
            <span class="r">
              {#if m.you}<span class="muted small">You</span>
              {:else}<button class="btn sm danger-text" type="button" disabled={!!busy} onclick={() => (confirming = { kind: 'member', id: m.id, label: m.email })}>{m.kind === 'invite' ? 'Cancel invite' : 'Remove'}</button>{/if}
            </span>
          </div>
        {:else}
          <p class="muted pad">No members yet.</p>
        {/each}
        <p class="muted small pad">The last owner can't be removed or demoted. Every change is recorded in the audit log.</p>
      </section>

      <section class="card pad col" aria-label="API tokens">
        <div class="tokhead">
          <h2>API tokens (CLI)</h2>
          <code class="muted small">BOOKS_TOKEN=… books entries list</code>
        </div>
        <form class="tokform" onsubmit={(ev) => { ev.preventDefault(); createToken(); }}>
          <input aria-label="Token name" placeholder='Name, e.g. "laptop CLI"' bind:value={tokenName} maxlength="80" />
          <button class="btn" type="submit" disabled={!!busy || !tokenName.trim()}>New token</button>
        </form>
        {#if newToken}
          <div class="once" role="status">
            <span>Token "{newToken.name}" created. Copy it now — it won't be shown again.</span>
            <div class="oncerow"><code class="mono">{newToken.token}</code><button class="btn sm ok" type="button" onclick={copy}>Copy</button><button class="btn sm" type="button" onclick={() => (newToken = null)}>Done</button></div>
          </div>
        {/if}
        {#each data.tokens as t (t.id)}
          <div class="trow" class:revoked={!!t.revokedAt}>
            <strong>{t.name}</strong>
            <span class="muted">{t.userEmail}</span>
            <span class="muted">{t.revokedAt ? `Revoked ${when(t.revokedAt)}` : t.lastUsedAt ? `Used ${when(t.lastUsedAt)}` : 'Never used'}</span>
            {#if !t.revokedAt}<button class="btn sm danger-text" type="button" disabled={!!busy} onclick={() => (confirming = { kind: 'token', id: t.id, label: t.name })}>Revoke</button>{:else}<span></span>{/if}
          </div>
        {:else}
          <p class="muted small">No tokens. Create one to use the CLI against the hosted app.</p>
        {/each}
      </section>
    </div>

    <aside class="card pad col side" aria-label="Invite someone">
      <h2>Invite someone</h2>
      <form class="col" onsubmit={(ev) => { ev.preventDefault(); invite(); }}>
        <label class="col">Google email <input type="email" required bind:value={email} placeholder="name@example.com" /></label>
        <label class="col">Role
          <select bind:value={role}>
            <option value="reviewer">Reviewer — approve, ask, reject</option>
            <option value="viewer">Viewer — read only</option>
            <option value="owner">Owner — everything, incl. ledgers and members</option>
          </select>
        </label>
        <button class="btn primary" type="submit" disabled={!!busy || !email.trim()}>{busy === 'invite' ? 'Inviting…' : 'Send invite'}</button>
      </form>
      <p class="muted small">No email is sent. They sign in with Google; the invite is accepted on first sign-in.</p>
    </aside>
  </div>
{/if}

{#if confirming}
  <div class="confirm card pad" role="alertdialog" aria-label="Confirm">
    <p>{confirming.kind === 'member' ? `Remove ${confirming.label}? Their API tokens for this company stop working.` : `Revoke "${confirming.label}"? The next CLI call with it gets 401.`}</p>
    <div class="oncerow"><button class="btn danger" type="button" onclick={confirm}>{confirming.kind === 'member' ? 'Remove' : 'Revoke'}</button><button class="btn" type="button" onclick={() => (confirming = null)}>Cancel</button></div>
  </div>
{/if}

<style>
  .head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; }
  .head h1 { margin: 0; }
  .layout { display: flex; gap: 16px; align-items: flex-start; }
  .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  .side { width: 340px; flex-shrink: 0; }
  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
  .pad { padding: 16px; }
  .col { display: flex; flex-direction: column; gap: 10px; }
  h2 { margin: 0; font-size: 15px; }
  .row { display: grid; grid-template-columns: 2.2fr 1fr 1.2fr 1fr; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  .th { font-size: 12px; color: var(--muted); font-weight: 500; background: var(--bg); padding: 10px 16px; }
  .who { display: flex; flex-direction: column; min-width: 0; }
  .who strong { font-weight: 500; }
  .r { text-align: right; }
  .small { font-size: 12px; }
  .pend { color: var(--warn); }
  select, input { height: 32px; border: 1px solid var(--line-strong); border-radius: 6px; padding: 0 8px; font: inherit; font-size: 13px; background: var(--surface); }
  label { font-size: 13px; }
  .tokhead { display: flex; align-items: baseline; gap: 10px; }
  .tokform { display: flex; gap: 8px; }
  .tokform input { flex: 1; }
  .once { padding: 10px 12px; border-radius: 6px; background: #f0fdf4; border: 1px solid #86efac; color: #166534; font-size: 13px; display: flex; flex-direction: column; gap: 6px; }
  .oncerow { display: flex; gap: 8px; align-items: center; }
  .oncerow code { flex: 1; padding: 6px 8px; background: #fff; border: 1px solid var(--line-strong); border-radius: 4px; font-size: 12px; overflow-x: auto; white-space: nowrap; }
  .trow { display: grid; grid-template-columns: 1.4fr 1.4fr 1.2fr auto; gap: 12px; align-items: center; font-size: 13px; }
  .trow.revoked { opacity: 0.55; }
  .danger-text { color: var(--danger); }
  .ok { background: #166534; color: #fff; border: 0; }
  .confirm { position: fixed; bottom: 24px; right: 24px; max-width: 420px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.12); z-index: 20; }
  .confirm p { margin: 0 0 10px; }
  @media (max-width: 900px) { .layout { flex-direction: column; } .side { width: 100%; } .row { grid-template-columns: 1fr 1fr; } }
</style>
