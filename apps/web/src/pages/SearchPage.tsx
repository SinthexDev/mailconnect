import { useEffect, useState, type FormEvent } from 'react';
import { api, errMsg, fmtDate, type Mailbox, type MessageBody, type MessageSummary } from '../api';
import { useI18n } from '../LanguageSwitcher';

export function SearchPage() {
  const { m } = useI18n();
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
          <h1>{m.searchTitle}</h1>
          <p className="muted">{m.searchLead}</p>
        </div>
      </header>
      <form className="searchbar" onSubmit={search} role="search">
        <label className="grow">{m.query}<input type="search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label>{m.mailbox}
          <select value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}>
            <option value="">{m.allMailboxes}</option>
            {boxes.map((b) => <option key={b.id} value={b.id}>{b.displayName}</option>)}
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? m.searching : m.searchBtn}</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {msgs && msgs.length === 0 && <div className="empty"><p>{m.noMessages}</p></div>}
      {msgs && msgs.length > 0 && (
        <div className={`split${open ? ' has-open' : ''}`}>
          <ul className="rows msgs">
            {msgs.map((item) => (
              <li key={item.id} className={`row${open?.id === item.id ? ' active' : ''}`}>
                <button type="button" className="msg-btn" onClick={() => void show(item)} aria-pressed={open?.id === item.id}>
                  <span className="row-title"><strong>{item.subject || m.noSubject}</strong><span className="muted small">{fmtDate(item.date)}</span></span>
                  <span className="muted small">{item.from} · {item.folder}{item.hasAttachments ? ` · ${m.attachment}` : ''}</span>
                  <span className="snippet">{item.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
          {open && (
            <article className="card reader" aria-label={m.message}>
              <button type="button" className="link close" onClick={() => setOpen(null)}>{m.close}</button>
              {open.body ? (
                <>
                  <h2>{open.body.subject || m.noSubject}</h2>
                  <dl className="meta">
                    <dt>{m.from}</dt><dd>{open.body.from}</dd>
                    <dt>{m.to}</dt><dd>{open.body.to}</dd>
                    {open.body.cc && <><dt>Cc</dt><dd>{open.body.cc}</dd></>}
                    <dt>{m.date}</dt><dd>{fmtDate(open.body.date)}</dd>
                  </dl>
                  {open.body.attachments && open.body.attachments.length > 0 && (
                    <div className="attachments">
                      <h3>{m.attachmentsHeading}</h3>
                      <ul>
                        {open.body.attachments.map((file) => (
                          <li key={file.id}>
                            <a href={`${import.meta.env.BASE_URL}api/messages/${encodeURIComponent(open.id)}/attachments/${encodeURIComponent(file.id)}`}>{file.filename}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <pre className="body">{open.body.text ?? (open.body.html ? m.htmlOnly : m.emptyBody)}</pre>
                </>
              ) : <p className="muted">{m.loadingMessage(current?.subject ?? '')}</p>}
            </article>
          )}
        </div>
      )}
      {!msgs && <div className="empty"><p>{m.searchPrompt}</p></div>}
    </>
  );
}
