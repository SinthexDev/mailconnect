import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errMsg, fmtDate, type Mailbox, type Stats } from '../api';
import { localizeStored } from '../i18n';
import { useI18n } from '../LanguageSwitcher';

export function HomePage() {
  const { m } = useI18n();
  const status: Record<Mailbox['indexStatus'], string> = {
    idle: m.statusIdle, syncing: m.statusSyncing, paused: m.statusPaused, error: m.statusError, disabled: m.statusSendOnly,
  };
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

  useEffect(() => {
    const t = setInterval(() => void load(), 1000);
    return () => clearInterval(t);
  }, [load]);

  async function sync(id: string) {
    try { await api(`mailboxes/${id}/sync`, 'POST'); await load(); } catch (e) { setErr(errMsg(e)); }
  }

  async function stop(id: string) {
    try { await api(`mailboxes/${id}/sync/stop`, 'POST'); await load(); } catch (e) { setErr(errMsg(e)); }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{m.homeTitle}</h1>
          {stats && (
            <p className="muted">
              {m.statsLine(stats.indexedMessages.toLocaleString(undefined), stats.mailboxCount, stats.errors, fmtDate(stats.lastSyncAt))}
            </p>
          )}
        </div>
        <Link className="btn primary" to="/mailboxes/new">{m.addMailbox}</Link>
      </header>
      {err && <p className="error" role="alert">{err}</p>}
      {boxes === null ? <p className="muted">{m.loadingMailboxes}</p> : boxes.length === 0 ? (
        <div className="empty">
          <p>{m.emptyMailboxes}</p>
          <Link className="btn primary" to="/mailboxes/new">{m.connectFirst}</Link>
        </div>
      ) : (
        <ul className="rows">
          {boxes.map((b) => (
            <li key={b.id} className={`row status-${b.indexStatus}`}>
              <div className="row-main">
                <div className="row-title">
                  <Link to={`/mailboxes/${b.id}`}>{b.displayName}</Link>
                  <span className="status-word">{status[b.indexStatus]}</span>
                </div>
                {b.description && <div>{b.description}</div>}
                {b.instructions && <div className="muted">{m.instructionsPrefix}: {b.instructions}</div>}
                <div className="muted">{b.email} · {[b.imap && 'IMAP', b.smtp && 'SMTP'].filter(Boolean).join(' + ')}</div>
                <div className="muted">
                  {!b.imap ? m.smtpOnly : b.messageTotal != null
                    ? m.progressLine(b.indexedCount.toLocaleString(undefined), b.messageTotal.toLocaleString(undefined), b.folderDone.toLocaleString(undefined), b.folderTotal.toLocaleString(undefined), fmtDate(b.lastSyncAt))
                    : b.indexStatus === 'syncing' ? m.counting : m.indexedLine(b.indexedCount.toLocaleString(undefined), fmtDate(b.lastSyncAt))}
                </div>
                {b.imap && (b.indexStatus === 'syncing' || b.indexStatus === 'paused') && (
                  <div
                    className={b.messageTotal != null && b.messageTotal > 0 ? 'progress' : 'progress unknown'}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={b.messageTotal ?? 0}
                    aria-valuenow={b.indexedCount}
                  >
                    {b.messageTotal != null && b.messageTotal > 0 && (
                      <span style={{ width: `${Math.min(100, (b.indexedCount / b.messageTotal) * 100)}%` }} />
                    )}
                  </div>
                )}
                {b.lastError && <div className="error small">{localizeStored(b.lastError)}</div>}
              </div>
              <div className="row-actions">
                {b.imap && (b.indexStatus === 'syncing' ? (
                  <button type="button" className="btn" aria-busy="true" onClick={() => void stop(b.id)}>
                    <span className="spin" aria-hidden="true" />
                    {m.stopSync}
                  </button>
                ) : (
                  <button type="button" className="btn" onClick={() => void sync(b.id)}>{m.syncNow}</button>
                ))}
                <Link className="btn ghost" to={`/mailboxes/${b.id}`}>{m.edit}</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
