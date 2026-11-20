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
        `state ${e.state} · Slash ${e.ledgerStatus}${e.stateReason ? ` · ${e.stateReason}` : ''}`,
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
    case 'ledgers.list': {
      const ls = data as { id: string; kind: string; name: string; mode: string; status: string; capabilities: { code: string }; inReview: number; lastPullAt: string | null; lastError: string | null; blockers: string[] }[];
      if (!ls.length) return 'No ledgers connected — books ledger add --kind mercury --name "Mercury"';
      return table(['ID', 'NAME', 'KIND', 'MODE', 'STATUS', 'WRITES TO', 'IN REVIEW', 'LAST PULL'], ls.map((l) => [l.id, l.name, l.kind, l.mode, l.status,
        l.capabilities.code === 'qbo_direct' ? 'QuickBooks directly' : `${l.name} sync`, String(l.inReview), l.lastError ? `error: ${l.lastError.slice(0, 30)}` : (l.lastPullAt?.slice(0, 16).replace('T', ' ') ?? 'never')]), [6]);
    }
    case 'ledger.show':
    case 'ledger.test': {
      const l = data as { id: string; name: string; kind: string; status: string; mode: string; blockers: string[]; health: { ok: boolean; message: string } | null; capabilities: Record<string, unknown>; config: { qboBankAccountIdByAccount?: Record<string, string> } };
      return [`${l.id} · ${l.name} · ${l.kind} · ${l.mode} · ${l.status}`,
        l.health ? `Health: ${l.health.ok ? 'ok' : 'FAILED'} — ${l.health.message}` : '',
        `Capabilities: ${Object.entries(l.capabilities).map(([k, v]) => `${k}=${v}`).join(', ')}`,
        `Bank mapping: ${Object.entries(l.config.qboBankAccountIdByAccount ?? {}).map(([k, v]) => `${k}→${v}`).join(', ') || '—'}`,
        l.blockers.length ? `Cannot activate yet:\n  - ${l.blockers.join('\n  - ')}` : 'Ready to activate'].filter(Boolean).join('\n');
    }
    case 'ledger.add':
    case 'ledger.configure': {
      const l = data as { id: string; name: string; status: string; blockers: string[] };
      return `${name === 'ledger.add' ? 'Added' : 'Updated'} ${l.id} (${l.name}) · ${l.status}${l.blockers.length ? `\nBefore activating:\n  - ${l.blockers.join('\n  - ')}` : `\nActivate with: books ledger enable ${l.id}`}`;
    }
    case 'ledger.enable':
    case 'ledger.disable': { const l = data as { id: string; status: string }; return `${l.id} is ${l.status}`; }
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
    case 'auth.whoami': { const w = data as { email: string; orgName: string; orgId: string; role: string; via: string }; return `${w.email} · ${w.role} of ${w.orgName} (${w.orgId}) · via ${w.via}`; }
    case 'members.list': {
      const ms = data as { id: string; kind: string; email: string; role: string; lastSeenAt: string | null; you: boolean }[];
      return table(['ID', 'Email', 'Role', 'Status'], ms.map((m) => [m.id, m.email + (m.you ? ' (you)' : ''), m.role, m.kind === 'invite' ? 'invite pending' : m.lastSeenAt ? `seen ${m.lastSeenAt.slice(0, 16).replace('T', ' ')}` : 'never signed in']));
    }
    case 'member.invite': { const m = data as { id: string; email: string; role: string; kind: string }; return m.kind === 'invite' ? `Invited ${m.email} as ${m.role} (${m.id}) · accepted on first Google sign-in` : `Added ${m.email} as ${m.role} (${m.id})`; }
    case 'member.role': { const m = data as { email: string; role: string }; return `${m.email} is now ${m.role}`; }
    case 'member.remove': { const m = data as { email: string; kind: string }; return m.kind === 'invite' ? `Cancelled the invite for ${m.email}` : `Removed ${m.email}; their tokens for this company are revoked`; }
    case 'tokens.list': {
      const ts = data as { id: string; name: string; userEmail: string; lastUsedAt: string | null; revokedAt: string | null }[];
      return table(['ID', 'Name', 'User', 'Status'], ts.map((t) => [t.id, t.name, t.userEmail, t.revokedAt ? 'revoked' : t.lastUsedAt ? `used ${t.lastUsedAt.slice(0, 16).replace('T', ' ')}` : 'never used']));
    }
    case 'token.create': { const t = data as { id: string; name: string; token: string }; return `Created ${t.id} "${t.name}". Copy it now — it is not shown again:\n\n  export BOOKS_TOKEN=${t.token}\n`; }
    case 'token.revoke': { const t = data as { id: string; name: string }; return `Revoked ${t.id} "${t.name}"`; }
    case 'orgs.list': { const os = data as { id: string; name: string; role: string; current: boolean }[]; return table(['', 'ID', 'Company', 'Role'], os.map((o) => [o.current ? '*' : '', o.id, o.name, o.role])); }
    case 'org.select': { const o = data as { id: string; name: string }; return `Now in ${o.name} (${o.id}) for this web session`; }
    default: return JSON.stringify(data, null, 2);
  }
}
