<script lang="ts">
  // On/off switch for a registry component. Turning off asks for confirmation and names the whenOff behavior.
  import { invalidateAll } from '$app/navigation';
  import { call } from '$lib/client';
  import { ui } from '$lib/ui.svelte';
  import type { Component } from '$lib/types';
  let { c }: { c: Pick<Component, 'id' | 'enabled' | 'toggle' | 'whenOff'> } = $props();
  let confirming = $state(false);
  let busy = $state(false);

  async function set(enabled: boolean) {
    busy = true;
    try {
      await call(enabled ? 'component.enable' : 'component.disable', { id: c.id });
      ui.toast(enabled ? `${c.id} is on` : `${c.id} is off — ${c.whenOff}`);
      confirming = false;
      await invalidateAll();
    } catch (e) { ui.toast((e as Error).message, { kind: 'error' }); }
    finally { busy = false; }
  }
</script>

{#if !c.toggle}
  <span class="req" title="Required component">Required</span>
{:else}
  <label class="switch">
    <input type="checkbox" role="switch" checked={c.enabled} disabled={busy} aria-label="{c.id} active"
      onclick={(e) => { e.preventDefault(); if (c.enabled) confirming = true; else set(true); }} />
    <span class="track" aria-hidden="true"><span class="knob"></span></span>
    <span class="lbl">{c.enabled ? 'On' : 'Off'}</span>
  </label>
  {#if confirming}
    <div class="confirm" role="alertdialog" aria-label="Confirm switching off {c.id}">
      <p>Switch off <code>{c.id}</code>?</p>
      <p class="muted">{c.whenOff}</p>
      <div class="acts">
        <button class="btn sm danger" type="button" onclick={() => set(false)} disabled={busy}>Switch off</button>
        <button class="btn sm" type="button" onclick={() => (confirming = false)}>Cancel</button>
      </div>
    </div>
  {/if}
{/if}

<style>
  .req { font-size: 12px; color: var(--muted); }
  .switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; position: relative; }
  .switch input { position: absolute; opacity: 0; width: 40px; height: 22px; margin: 0; cursor: pointer; z-index: 1; }
  .track { width: 38px; height: 22px; border-radius: 11px; background: var(--line-strong); position: relative; transition: background .15s; }
  .knob { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s; }
  input:checked + .track { background: var(--accent); }
  input:checked + .track .knob { transform: translateX(16px); }
  input:focus-visible + .track { outline: 2px solid var(--accent); outline-offset: 2px; }
  .lbl { font-size: 13px; min-width: 24px; }
  .confirm { margin-top: 8px; padding: 12px; border: 1px solid var(--danger-line); background: var(--danger-soft); border-radius: 8px; display: flex; flex-direction: column; gap: 6px; }
  .confirm p { margin: 0; font-size: 13px; }
  .acts { display: flex; gap: 6px; }
  code { font-family: var(--mono); font-size: 12px; }
</style>
