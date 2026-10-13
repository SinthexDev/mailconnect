import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, errMsg, fmtDate, type TokenRow } from '../api';
import { useI18n } from '../LanguageSwitcher';

const art = (file: string) => `${import.meta.env.BASE_URL}art/${file}`;

function mcpConfig(url: string, token: string) {
  return JSON.stringify({
    mcpServers: { mailconnect: { url, headers: { Authorization: `Bearer ${token}`, "X-Api-Key": token } } },
  }, null, 2);
}

export function TokensPage() {
  const { m } = useI18n();
  const mcpUrl = `${window.location.origin}${import.meta.env.BASE_URL}mcp`;
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pending = useRef(false);
  const revealRef = useRef<HTMLElement>(null);

  const load = useCallback(() => {
    api<{ tokens: TokenRow[] }>('tokens').then((r) => setTokens(r.tokens)).catch((e) => setErr(errMsg(e)));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (secret) revealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [secret]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ secret: string; token: TokenRow }>('tokens', 'POST', { name: name.trim() });
      setSecret(r.secret);
      setName('');
      setTokens((rows) => {
        const list = rows ?? [];
        return list.some((item) => item.id === r.token.id) ? list : [r.token, ...list];
      });
      load();
    } catch (x) { setErr(errMsg(x)); }
    finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm(m.revokeConfirm)) return;
    try { await api(`tokens/${id}`, 'DELETE'); load(); } catch (x) { setErr(errMsg(x)); }
  }

  const config = secret ? mcpConfig(mcpUrl, secret) : '';

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{m.tokensTitle}</h1>
          <p className="muted">{m.tokensLead}</p>
        </div>
      </header>
      <section className="explain steps" aria-label={m.tokensLead}>
        <article>
          <img src={art('mcp-address.png')} alt="" />
          <h2>{m.mcpStepUrlTitle}</h2>
          <p>{m.mcpStepUrlBody}</p>
        </article>
        <article>
          <img src={art('mcp-token.png')} alt="" />
          <h2>{m.mcpStepTokenTitle}</h2>
          <p>{m.mcpStepTokenBody}</p>
        </article>
        <article>
          <img src={art('mcp-read.png')} alt="" />
          <h2>{m.mcpStepUseTitle}</h2>
          <p>{m.mcpStepUseBody}</p>
        </article>
      </section>
      <section className="card">
        <h2>{m.mcpUrlTitle}</h2>
        <p className="muted">{m.mcpUrlBody}</p>
        <pre className="code">{mcpUrl}</pre>
        <div className="actions">
          <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(mcpUrl)}>{m.copyUrl}</button>
        </div>
        <pre className="code">{mcpConfig(mcpUrl, m.tokenStandIn)}</pre>
      </section>
      <form className="card form inline" onSubmit={create}>
        <label className="grow">{m.tokenName}<input required maxLength={80} placeholder={m.tokenPlaceholder} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} /></label>
        <button type="submit" className="btn primary" aria-busy={busy}>
          {busy && <span className="spin" aria-hidden="true" />}
          {busy ? m.creatingToken : m.createToken}
        </button>
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      {secret && (
        <section className="card reveal" aria-live="polite" ref={revealRef}>
          <h2>{m.copyTokenTitle}</h2>
          <p className="muted">{m.copyTokenLead}</p>
          <pre className="code">{secret}</pre>
          <p>{m.cursorHint}</p>
          <p className="kv"><span>url</span> <code>{mcpUrl}</code></p>
          <p className="kv"><span>header</span> <code>Authorization: Bearer {secret}</code></p>
          <pre className="code">{config}</pre>
          <div className="actions">
            <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(config)}>{m.copyConfig}</button>
            <button type="button" className="btn ghost" onClick={() => setSecret(null)}>{m.hide}</button>
          </div>
        </section>
      )}
      {tokens && tokens.length === 0 ? (
        <div className="empty"><p>{m.noTokens}</p></div>
      ) : (
        <ul className="rows">
          {(tokens ?? []).map((t) => (
            <li key={t.id} className="row">
              <div className="row-main">
                <div className="row-title">{t.name}<span className="status-word">{t.revokedAt ? m.revoked : m.active}</span></div>
                <div className="muted">{m.tokenMeta(fmtDate(t.createdAt), fmtDate(t.lastUsedAt))}</div>
              </div>
              {!t.revokedAt && <div className="row-actions"><button type="button" className="btn danger" onClick={() => void revoke(t.id)}>{m.revoke}</button></div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
