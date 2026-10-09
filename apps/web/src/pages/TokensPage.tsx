import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errMsg, fmtDate, type TokenRow } from '../api';

export function TokensPage() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    api<{ tokens: TokenRow[] }>('tokens').then((r) => setTokens(r.tokens)).catch((e) => setErr(errMsg(e)));
  }, []);
  useEffect(load, [load]);

  async function create(e: FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const r = await api<{ secret: string }>('tokens', 'POST', { name: name.trim() });
      setSecret(r.secret); setName(''); load();
    } catch (x) { setErr(errMsg(x)); }
  }

  async function revoke(id: string) {
    if (!window.confirm('Token widerrufen? Verbundene Agenten verlieren sofort den Zugriff.')) return;
    try { await api(`tokens/${id}`, 'DELETE'); load(); } catch (x) { setErr(errMsg(x)); }
  }

  const config = secret ? JSON.stringify({
    mcpServers: { mailconnect: { url: 'https://sinthex.de/mailconnect/mcp', headers: { Authorization: `Bearer ${secret}` } } }
  }, null, 2) : '';

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Agent-Tokens</h1>
          <p className="muted">Mit einem Token greift ein MCP-Client wie Cursor auf Suche und Versand deiner Postfächer zu.</p>
        </div>
      </header>
      <form className="card form inline" onSubmit={create}>
        <label className="grow">Name des Tokens<input required maxLength={80} placeholder="z. B. Cursor auf dem Laptop" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button type="submit" className="btn primary">Token erstellen</button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {secret && (
        <section className="card reveal" aria-live="polite">
          <h2>Token jetzt kopieren</h2>
          <p className="muted">Das Geheimnis wird nur dieses eine Mal angezeigt.</p>
          <pre className="code">{secret}</pre>
          <p>Trage in der Cursor-MCP-Konfiguration diese URL und diesen Header ein:</p>
          <p className="kv"><span>url</span> <code>https://sinthex.de/mailconnect/mcp</code></p>
          <p className="kv"><span>header</span> <code>Authorization: Bearer {secret}</code></p>
          <pre className="code">{config}</pre>
          <div className="actions">
            <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(config)}>Konfiguration kopieren</button>
            <button type="button" className="btn ghost" onClick={() => setSecret(null)}>Ausblenden</button>
          </div>
        </section>
      )}
      {tokens && tokens.length === 0 ? (
        <div className="empty"><p>Noch kein Token vorhanden. Erstelle eines, um einen Agenten zu verbinden.</p></div>
      ) : (
        <ul className="rows">
          {(tokens ?? []).map((t) => (
            <li key={t.id} className="row">
              <div className="row-main">
                <div className="row-title">{t.name}<span className="status-word">{t.revokedAt ? 'Widerrufen' : 'Aktiv'}</span></div>
                <div className="muted">Erstellt {fmtDate(t.createdAt)} · zuletzt genutzt {fmtDate(t.lastUsedAt)}</div>
              </div>
              {!t.revokedAt && <div className="row-actions"><button type="button" className="btn danger" onClick={() => void revoke(t.id)}>Widerrufen</button></div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
