import { useEffect, useState, type FormEvent } from 'react';
import { api, errMsg, fmtDate, type Mailbox, type MessageBody, type MessageSummary } from '../api';

export function SearchPage() {
  const [q, setQ] = useState('');
  const [mailboxId, setMailboxId] = useState('');
  const [boxes, setBoxes] = useState<Mailbox[]>([]);
  const [msgs, setMsgs] = useState<MessageSummary[] | null>(null);
  const [open, setOpen] = useState<{ id: string; body: MessageBody | null } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ mailboxes: Mailbox[] }>('mailboxes').then((r) => setBoxes(r.mailboxes)).catch(() => undefined);
  }, []);

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(''); setOpen(null);
    const p = new URLSearchParams({ q, limit: '50' });
    if (mailboxId) p.set('mailboxId', mailboxId);
    try { setMsgs((await api<{ messages: MessageSummary[] }>(`messages?${p}`)).messages); }
    catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }

  async function show(m: MessageSummary) {
    setOpen({ id: m.id, body: null });
    try {
      const body = await api<MessageBody>(`messages/${encodeURIComponent(m.id)}/body`);
      setOpen({ id: m.id, body });
    } catch (x) { setErr(errMsg(x)); setOpen(null); }
  }

  const current = msgs?.find((m) => m.id === open?.id);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Suche</h1>
          <p className="muted">Durchsucht den lokalen Index aller verbundenen Postfächer.</p>
        </div>
      </header>
      <form className="searchbar" onSubmit={search} role="search">
        <label className="grow">Suchbegriff<input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label>Postfach
          <select value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}>
            <option value="">Alle</option>
            {boxes.map((b) => <option key={b.id} value={b.id}>{b.displayName}</option>)}
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Suche …' : 'Suchen'}</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {msgs && msgs.length === 0 && <div className="empty"><p>Keine Nachrichten gefunden.</p></div>}
      {msgs && msgs.length > 0 && (
        <div className={`split${open ? ' has-open' : ''}`}>
          <ul className="rows msgs">
            {msgs.map((m) => (
              <li key={m.id} className={`row${open?.id === m.id ? ' active' : ''}`}>
                <button type="button" className="msg-btn" onClick={() => void show(m)} aria-pressed={open?.id === m.id}>
                  <span className="row-title"><strong>{m.subject || '(ohne Betreff)'}</strong><span className="muted small">{fmtDate(m.date)}</span></span>
                  <span className="muted small">{m.from} · {m.folder}{m.hasAttachments ? ' · Anhang' : ''}</span>
                  <span className="snippet">{m.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
          {open && (
            <article className="card reader" aria-label="Nachricht">
              <button type="button" className="link close" onClick={() => setOpen(null)}>Schließen</button>
              {open.body ? (
                <>
                  <h2>{open.body.subject || '(ohne Betreff)'}</h2>
                  <dl className="meta">
                    <dt>Von</dt><dd>{open.body.from}</dd>
                    <dt>An</dt><dd>{open.body.to}</dd>
                    {open.body.cc && <><dt>Cc</dt><dd>{open.body.cc}</dd></>}
                    <dt>Datum</dt><dd>{fmtDate(open.body.date)}</dd>
                  </dl>
                  <pre className="body">{open.body.text ?? (open.body.html ? 'Diese Nachricht enthält nur HTML-Inhalt.' : '(leer)')}</pre>
                </>
              ) : <p className="muted">{current?.subject ?? ''} wird geladen …</p>}
            </article>
          )}
        </div>
      )}
      {!msgs && <div className="empty"><p>Gib einen Suchbegriff ein, um den Index zu durchsuchen.</p></div>}
    </>
  );
}
