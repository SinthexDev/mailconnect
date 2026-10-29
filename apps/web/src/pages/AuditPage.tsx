import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, errMsg, fmtDate, type AuditAgent, type AuditEvent, type AuditFilter, type Mailbox } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../LanguageSwitcher';

const EMPTY: AuditFilter = { agent: '', tokenId: '', action: '', category: '', status: '', source: '', mailboxId: '', since: '', until: '', q: '' };
const PAGE = 100;

function query(filter: AuditFilter, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams(extra);
  for (const [key, value] of Object.entries(filter)) {
    if (!value) continue;
    p.set(key, key === 'since' || key === 'until' ? new Date(value).toISOString() : value);
  }
  return p.toString();
}

function pretty(value: unknown): string {
  return value === null || value === undefined ? '' : JSON.stringify(value, null, 2);
}

export function AuditPage() {
  const { m } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState<'events' | 'agents'>('events');
  const [draft, setDraft] = useState<AuditFilter>(EMPTY);
  const [filter, setFilter] = useState<AuditFilter>(EMPTY);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [agents, setAgents] = useState<AuditAgent[] | null>(null);
  const [boxes, setBoxes] = useState<Mailbox[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [verdict, setVerdict] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ mailboxes: Mailbox[] }>('mailboxes').then((r) => setBoxes(r.mailboxes)).catch(() => undefined);
    api<{ agents: AuditAgent[] }>('audit/agents').then((r) => setAgents(r.agents)).catch((e) => setErr(errMsg(e)));
  }, []);

  const load = useCallback(async (next: AuditFilter) => {
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ events: AuditEvent[]; total: number }>(`audit?${query(next, { limit: String(PAGE) })}`);
      setEvents(r.events);
      setTotal(r.total);
      setOpen(null);
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(filter); }, [filter, load]);

  async function older() {
    const last = events[events.length - 1];
    if (!last) return;
    setBusy(true);
    try {
      const r = await api<{ events: AuditEvent[]; total: number }>(`audit?${query(filter, { limit: String(PAGE), before: String(last.seq) })}`);
      setEvents((rows) => [...rows, ...r.events]);
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }

  function apply(e: FormEvent) {
    e.preventDefault();
    setFilter({ ...draft });
  }

  function reset() {
    setDraft(EMPTY);
    setFilter(EMPTY);
  }

  function showAgent(agent: AuditAgent) {
    const next = { ...EMPTY, agent: agent.agentName ?? '', tokenId: agent.tokenId ?? '' };
    setDraft(next);
    setFilter(next);
    setTab('events');
  }

  async function verify() {
    setVerdict(m.auditVerifying);
    try {
      const r = await api<{ ok: boolean; checked: number; brokenAtSeq: number | null }>('audit/verify');
      setVerdict(r.ok ? m.auditVerifyOk(r.checked) : m.auditVerifyBroken(r.brokenAtSeq ?? 0));
    } catch (x) { setVerdict(errMsg(x)); }
  }

  const base = `${import.meta.env.BASE_URL}api/audit/export`;
  const exportQuery = query(filter);
  const tokens = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of agents ?? []) if (a.tokenId) seen.set(a.tokenId, a.tokenName ?? a.tokenId);
    return [...seen.entries()];
  }, [agents]);
  const names = useMemo(() => [...new Set((agents ?? []).map((a) => a.agentName).filter((n): n is string => Boolean(n)))].sort(), [agents]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{m.auditTitle}</h1>
          <p className="muted">{m.auditLead}</p>
        </div>
      </header>
      <div className="actions audit-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'btn primary' : 'btn'} onClick={() => setTab('events')}>{m.auditTabEvents}</button>
        <button type="button" role="tab" aria-selected={tab === 'agents'} className={tab === 'agents' ? 'btn primary' : 'btn'} onClick={() => setTab('agents')}>{m.auditTabAgents}</button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}

      {tab === 'agents' && (
        <section>
          <p className="muted">{m.auditAgentsLead}</p>
          {agents && agents.length === 0 && <div className="empty"><p>{m.auditNoAgents}</p></div>}
          {agents && agents.length > 0 && (
            <div className="table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>{m.auditAgent}</th><th>{m.auditToken}</th><th>{m.auditCalls}</th><th>{m.auditErrors}</th>
                    <th>{m.auditSends}</th><th>{m.auditDeletes}</th><th>{m.auditTools}</th><th>{m.auditFirst}</th><th>{m.auditLast}</th><th />
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={`${a.tokenId}|${a.agentName}`}>
                      <td><strong>{a.agentName ?? m.auditNoName}</strong></td>
                      <td>{a.tokenName ?? '–'}</td>
                      <td>{a.calls}</td>
                      <td>{a.errors}</td>
                      <td>{a.sends}</td>
                      <td>{a.deletes}</td>
                      <td className="audit-tools">{a.tools.join(', ')}</td>
                      <td>{fmtDate(a.firstSeen)}</td>
                      <td>{fmtDate(a.lastSeen)}</td>
                      <td><button type="button" className="btn" onClick={() => showAgent(a)}>{m.auditShowEvents}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'events' && (
        <>
          <form className="searchbar audit-filter" onSubmit={apply}>
            <label>{m.auditAgent}
              <select value={draft.agent} onChange={(e) => setDraft({ ...draft, agent: e.target.value })}>
                <option value="">{m.auditAll}</option>
                {names.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>{m.auditToken}
              <select value={draft.tokenId} onChange={(e) => setDraft({ ...draft, tokenId: e.target.value })}>
                <option value="">{m.auditAll}</option>
                {tokens.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </label>
            <label>{m.auditCategory}
              <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                <option value="">{m.auditAll}</option>
                {Object.entries(m.auditCategories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>{m.auditStatus}
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                <option value="">{m.auditAll}</option>
                {Object.entries(m.auditStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>{m.auditSource}
              <select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}>
                <option value="">{m.auditAll}</option>
                {Object.entries(m.auditSources).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>{m.auditMailbox}
              <select value={draft.mailboxId} onChange={(e) => setDraft({ ...draft, mailboxId: e.target.value })}>
                <option value="">{m.auditAll}</option>
                {boxes.map((b) => <option key={b.id} value={b.id}>{b.email}</option>)}
              </select>
            </label>
            <label>{m.auditAction}<input value={draft.action} placeholder="send_email" onChange={(e) => setDraft({ ...draft, action: e.target.value })} /></label>
            <label>{m.auditSince}<input type="datetime-local" value={draft.since} onChange={(e) => setDraft({ ...draft, since: e.target.value })} /></label>
            <label>{m.auditUntil}<input type="datetime-local" value={draft.until} onChange={(e) => setDraft({ ...draft, until: e.target.value })} /></label>
            <label className="grow">{m.auditSearch}<input type="search" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} /></label>
            <button type="submit" className="btn primary" disabled={busy}>{m.auditApply}</button>
            <button type="button" className="btn ghost" onClick={reset}>{m.auditReset}</button>
          </form>

          <div className="actions audit-bar">
            <span className="muted">{m.auditCount(events.length, total)}</span>
            <a className="btn" href={`${base}?${query(filter, { format: 'json' })}`}>{m.auditExportJson}</a>
            <a className="btn" href={`${base}?${exportQuery ? `${exportQuery}&` : ''}format=csv`}>{m.auditExportCsv}</a>
            {user?.role === 'admin' && <button type="button" className="btn" onClick={() => void verify()}>{m.auditVerify}</button>}
          </div>
          {verdict && <p className="note" role="status">{verdict}</p>}

          {events.length === 0 && !busy && <div className="empty"><p>{m.auditNone}</p></div>}
          {events.length > 0 && (
            <div className="table-wrap">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>{m.auditColTime}</th><th>{m.auditAgent}</th><th>{m.auditToken}</th><th>{m.auditAction}</th>
                    <th>{m.auditCategory}</th><th>{m.auditMailbox}</th><th>{m.auditStatus}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <Fragment key={e.seq}>
                      <tr className={`audit-row status-${e.status}`} onClick={() => setOpen(open === e.seq ? null : e.seq)} aria-expanded={open === e.seq}>
                        <td>{fmtDate(e.ts)}</td>
                        <td>{e.agentName ?? (e.source === 'mcp' ? m.auditNoName : m.auditSources[e.source])}</td>
                        <td>{e.tokenName ?? '–'}</td>
                        <td><code>{e.action}</code></td>
                        <td>{m.auditCategories[e.category] ?? e.category}</td>
                        <td>{e.mailboxEmail ?? '–'}</td>
                        <td><span className="status-word">{m.auditStatuses[e.status] ?? e.status}</span></td>
                      </tr>
                      {open === e.seq && (
                        <tr className="audit-detail">
                          <td colSpan={7}>
                            <p className="muted">
                              #{e.seq} · {m.auditSources[e.source]}{e.runId ? ` · run ${e.runId}` : ''}{e.durationMs !== null ? ` · ${e.durationMs} ms` : ''}{e.ip ? ` · ${e.ip}` : ''}
                            </p>
                            {e.error && <><h3>{m.auditError}</h3><pre className="code">{e.error}</pre></>}
                            {Object.keys(e.resource).length > 0 && <><h3>{m.auditResource}</h3><pre className="code">{pretty(e.resource)}</pre></>}
                            {e.input !== null && <><h3>{m.auditInput}</h3><pre className="code">{pretty(e.input)}</pre></>}
                            {e.output !== null && <><h3>{m.auditOutput}</h3><pre className="code">{pretty(e.output)}</pre></>}
                            <p className="muted audit-hash">{m.auditChain}: {e.hash}</p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {events.length < total && <div className="actions"><button type="button" className="btn" disabled={busy} onClick={() => void older()}>{m.auditLoadMore}</button></div>}
        </>
      )}
    </>
  );
}
