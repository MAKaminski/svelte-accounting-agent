// Human output per command. --json bypasses this and prints the API schema verbatim.
import type { Entry, EntryDetail, Decision, Question, MappingProposal, EvalRun, Recommendation } from '../lib/types';

const money = (c: number | null | undefined) => c == null ? '' : (c < 0 ? '-' : '') + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
const short = (id: string) => id;

function table(head: string[], rows: string[][], right: number[] = []): string {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (r: string[]) => r.map((c, i) => right.includes(i) ? (c ?? '').padStart(w[i]) : (c ?? '').padEnd(w[i])).join('  ').trimEnd();
  return [line(head), ...rows.map(line)].join('\n');
}

const account = (r: Recommendation | null) => !r ? '—' : r.action === 'ask' ? '(question)' : r.lines.length > 1 ? `Split (${r.lines.length} lines)` : r.lines[0]?.accountName ?? '—';

export function format(name: string, data: unknown, values: Record<string, unknown>): string {
  switch (name) {
    case 'entries.pull': {
      const d = data as { pulled: number; newMerchants: number; dryRun: boolean; entries: Entry[] };
      const rec = d.entries.filter((e) => e.state === 'recommended').length;
      const inv = d.entries.filter((e) => e.state === 'invalid').length;
      return `${d.dryRun ? '[dry run] would pull' : 'Pulled'} ${d.pulled} entries in review (Slash) · ${d.newMerchants} new merchants${d.dryRun ? '' : ` · ${rec} recommended${inv ? ` · ${inv} invalid` : ''}`}`;
    }
    case 'entries.list': {
      const rows = (data as Entry[]);
      if (!rows.length) return `No entries${values.state ? ` in state ${values.state}` : ''}.`;
      return table(['ID', 'DATE', 'MERCHANT', 'AMOUNT', 'ACCOUNT', 'CONF', 'ASK', 'STATE'], rows.map((e) => [
        short(e.id), e.date ?? '', (e.merchantName ?? e.description ?? '').slice(0, 24), money(e.amountCents), account(e.recommendation),
        e.recommendation ? e.recommendation.confidence.toFixed(2) : '', e.recommendation?.action === 'ask' || e.openQuestionId ? 'yes' : '–', e.state
      ]), [3]);
    }
    case 'entry.show': {
      const e = data as EntryDetail;
      const r = e.recommendation;
      return [
        `${e.id}  ${e.date}  ${e.merchantName ?? e.description}  ${money(e.amountCents)}`,
        `state ${e.state} · Slash ${e.slashStatus}${e.stateReason ? ` · ${e.stateReason}` : ''}`,
        r ? `\nRecommendation (${r.model}, conf ${r.confidence.toFixed(2)}): ${r.action}` : '\nNo recommendation',
        ...(r?.lines ?? []).map((l) => `  ${l.accountName.padEnd(28)} ${money(l.amountCents).padStart(12)}  ${l.description ?? ''}`),
        r?.question ? `  Q: ${r.question}` : '', r ? `  ${r.reasoning}` : '',
        '\nEvidence:', ...e.evidence.map((x) => `  [${x.id}] ${x.kind}: ${x.summary}`),
        e.decisions.length ? '\nDecisions:' : '', ...e.decisions.map((d) => `  ${d.decidedAt} ${d.action} by ${d.decidedBy}`)
      ].filter((l) => l !== '').join('\n');
    }
    case 'entry.recommend': {
      const r = data as Recommendation;
      return `${r.action === 'ask' ? `Ask: ${r.question}` : `Code → ${r.lines.map((l) => `${l.accountName} ${money(l.amountCents)}`).join(', ')}`} · conf ${r.confidence.toFixed(2)} · ${r.model} · $${r.costUsd.toFixed(4)}`;
    }
    case 'entry.approve': {
      const d = data as Decision;
      const acct = d.lines?.length === 1 ? d.lines[0].accountName : `${d.lines?.length} lines`;
      if (d.dryRun) return `[dry run] would code ${d.entryId} → ${acct} and mark it ready to sync`;
      if (d.state === 'approved') return `Approved ${d.entryId} → ${acct} · sends to Slash at ${d.pendingUntil} (books entry undo ${d.entryId} to cancel)`;
      if (d.state === 'ready') return `Coded ${d.entryId} → ${acct} · marked ready to sync`;
      return `Approved ${d.entryId} → ${acct} · state ${d.state} (see books entry show ${d.entryId})`;
    }
    case 'entry.undo': return `Undone ${(data as Decision).entryId} · back to review`;
    case 'entry.reject': return `Rejected ${(data as Decision).entryId} · code it by hand in Slash`;
    case 'entry.ask': { const q = data as Question; return `Asked ${q.id} on ${q.entryId}: ${q.text}`; }
    case 'questions.list': {
      const qs = data as Question[];
      if (!qs.length) return 'No questions.';
      return table(['ID', 'ENTRY', 'MERCHANT', 'AMOUNT', 'STATUS', 'QUESTION'], qs.map((q) => [q.id, q.entryId, (q.merchant ?? '').slice(0, 20), money(q.amountCents), q.status, q.answer ? `${q.text} → ${q.answer}` : q.text]), [3]);
    }
    case 'question.answer': { const q = data as Question; return `Answered ${q.id}; ${q.entryId} is being re-recommended`; }
    case 'mappings.list': {
      const ms = data as MappingProposal[];
      if (!ms.length) return 'No rules.';
      return table(['ID', 'MERCHANT', 'ACCOUNT', 'SUPPORT', 'STATUS'], ms.map((m) => [m.id, m.sourceLabel, m.accountName, String(m.supportCount), m.status]), [3]);
    }
    case 'mapping.apply': { const m = data as MappingProposal; return m.dryRun ? `[dry run] would map ${m.sourceLabel} → ${m.accountName} in Slash and recode its entries in review` : `Applied rule: ${m.sourceLabel} → ${m.accountName} (Slash mapping)`; }
    case 'coa.pull': { const d = data as { accounts: { name: string; enabled: boolean }[]; dryRun: boolean }; return `${d.dryRun ? '[dry run] ' : ''}${d.accounts.length} accounts (${d.accounts.filter((a) => a.enabled).length} enabled)`; }
    case 'payouts.import': { const d = data as { imported: number; channel: string }; return `Imported ${d.imported} ${d.channel} payout rows`; }
    case 'evals.run': {
      const r = data as EvalRun;
      return [`Evals (${r.mode}): ${r.passed}/${r.total} passed · $${r.costUsd.toFixed(4)}`,
        ...r.cases.map((c) => `  ${c.pass ? 'PASS' : 'FAIL'}  ${c.kind.padEnd(6)} ${c.name}${c.failures.length ? `\n        ${c.failures.join('\n        ')}` : ''}`)].join('\n');
    }
    case 'evals.show': {
      const s = data as { lastRun: EvalRun | null; shadow: { decisions: number; precision: number | null; autoApproveWouldHave: number; autoApprovePrecision: number | null } };
      const pct = (x: number | null) => x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`;
      return `Last eval: ${s.lastRun ? `${s.lastRun.passed}/${s.lastRun.total}` : 'never run'}\nShadow precision: ${pct(s.shadow.precision)} over ${s.shadow.decisions} decisions · auto-approve would have taken ${s.shadow.autoApproveWouldHave} at ${pct(s.shadow.autoApprovePrecision)}`;
    }
    case 'eval.add': { const c = data as { id: string; name: string }; return `Added eval case ${c.id}: ${c.name}`; }
    case 'system.graph': {
      const g = data as { nodes: { id: string; kind: string; status: string }[]; edges: unknown[] };
      const by = (k: string) => g.nodes.filter((n) => n.kind === k).length;
      const off = g.nodes.filter((n) => n.status === 'off').map((n) => n.id);
      return `${g.nodes.length} nodes (${by('agent')} agents, ${by('rule') + by('human')} processes, ${by('tool')} tools, ${by('table')} tables, ${by('external')} external) · ${g.edges.length} edges` + (off.length ? `\nOff: ${off.join(', ')}` : '');
    }
    case 'components.list': {
      const cs = data as { id: string; kind: string; status: string; toggle: boolean; calls7d: number; p95Ms: number | null; costUsd7d: number; tier: string | null }[];
      return table(['ID', 'KIND', 'STATUS', 'SWITCH', 'CALLS 7D', 'P95 MS', 'COST 7D', 'TIER'], cs.map((c) => [c.id, c.kind, c.status, c.toggle ? 'yes' : 'required', String(c.calls7d), c.p95Ms == null ? '' : String(c.p95Ms), c.costUsd7d ? `$${c.costUsd7d.toFixed(4)}` : '', c.tier ?? '']), [4, 5, 6]);
    }
    case 'component.show': {
      const c = data as { id: string; kind: string; status: string; summary: string; whenOff: string | null; traces: string[]; runs: { startedAt: string; status: string; e2eMs: number | null }[] };
      return [`${c.id} · ${c.kind} · ${c.status}`, c.summary, c.whenOff ? `When off: ${c.whenOff}` : 'Required (cannot be switched off)', `Traces: ${c.traces.join(', ') || '—'}`,
        'Recent runs:', ...c.runs.slice(0, 5).map((r) => `  ${r.startedAt} ${r.status}${r.e2eMs != null ? ` ${r.e2eMs} ms` : ''}`)].join('\n');
    }
    case 'component.enable':
    case 'component.disable': { const c = data as { id: string; enabled: boolean; whenOff: string | null }; return `${c.id} is ${c.enabled ? 'on' : `off — ${c.whenOff}`}`; }
    default: return JSON.stringify(data, null, 2);
  }
}
