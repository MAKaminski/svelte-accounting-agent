// Small shared UI state: toasts (with optional Undo) and the selected queue row.
export interface Toast { id: number; text: string; undo?: () => Promise<void>; until?: number; kind?: 'ok' | 'error' }

class UiState {
  toasts = $state<Toast[]>([]);
  selectedId = $state<string | null>(null);
  paletteOpen = $state(false);
  busy = $state<string | null>(null);
  private n = 0;
  toast(text: string, opts: { undo?: () => Promise<void>; ms?: number; kind?: 'ok' | 'error' } = {}) {
    const id = ++this.n;
    const ms = opts.ms ?? (opts.undo ? 10_000 : 4_000);
    this.toasts.push({ id, text, undo: opts.undo, until: Date.now() + ms, kind: opts.kind });
    setTimeout(() => this.dismiss(id), ms);
    return id;
  }
  dismiss(id: number) { this.toasts = this.toasts.filter((t) => t.id !== id); }
}

export const ui = new UiState();
