import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg, fmtDate, type Mailbox, type Stats } from '../api';

const STATUS: Record<Mailbox['indexStatus'], string> = {
  idle: 'Bereit', syncing: 'Synchronisiert', error: 'Fehler', disabled: 'Nur Versand'
};

export function HomePage() {
  const [boxes, setBoxes] = useState<Mailbox[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([
        api<{ mailboxes: Mailbox[] }>('mailboxes'),
        api<{ stats: Stats }>('stats')
      ]);
      setBoxes(m.mailboxes); setStats(s.stats); setErr('');
    } catch (e) { setErr(errMsg(e)); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const anySyncing = boxes?.some((b) => b.indexStatus === 'syncing') ?? false;
  useEffect(() => {
    if (!anySyncing) return;
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [anySyncing, load]);

  async function sync(id: string) {
    try { await api(`mailboxes/${id}/sync`, 'POST'); await load(); } catch (e) { setErr(errMsg(e)); }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Postfächer</h1>
          {stats && (
            <p className="muted">
              {stats.indexedMessages.toLocaleString('de-DE')} Nachrichten im Index, {stats.mailboxCount} {stats.mailboxCount === 1 ? 'Postfach' : 'Postfächer'}
              {stats.errors > 0 ? `, ${stats.errors} mit Fehler` : ''}. Letzter Abgleich: {fmtDate(stats.lastSyncAt)}.
            </p>
          )}
        </div>
        <Link className="btn primary" to="/mailboxes/new">Postfach hinzufügen</Link>
      </header>
      {err && <p className="error" role="alert">{err}</p>}
      {boxes === null ? <p className="muted">Lade Postfächer …</p> : boxes.length === 0 ? (
        <div className="empty">
          <p>Noch kein Postfach verbunden, damit MailConnect einen Index für deine Agenten aufbauen kann.</p>
          <Link className="btn primary" to="/mailboxes/new">Erstes Postfach verbinden</Link>
        </div>
      ) : (
        <ul className="rows">
          {boxes.map((b) => (
            <li key={b.id} className={`row status-${b.indexStatus}`}>
              <div className="row-main">
                <div className="row-title">
                  <Link to={`/mailboxes/${b.id}`}>{b.displayName}</Link>
                  <span className="status-word">{STATUS[b.indexStatus]}</span>
                </div>
                <div className="muted">{b.email} · {[b.imap && 'IMAP', b.smtp && 'SMTP'].filter(Boolean).join(' + ')}</div>
                <div className="muted">
                  {b.imap ? `${b.indexedCount.toLocaleString('de-DE')} indiziert · zuletzt ${fmtDate(b.lastSyncAt)}` : 'Kein IMAP, nur Versand'}
                </div>
                {b.lastError && <div className="error small">{b.lastError}</div>}
                {b.indexStatus === 'syncing' && <div className="progress" role="progressbar" aria-label="Index wird aufgebaut" />}
              </div>
              <div className="row-actions">
                {b.imap && <button type="button" className="btn" disabled={b.indexStatus === 'syncing'} onClick={() => void sync(b.id)}>Jetzt synchronisieren</button>}
                <Link className="btn ghost" to={`/mailboxes/${b.id}`}>Bearbeiten</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
