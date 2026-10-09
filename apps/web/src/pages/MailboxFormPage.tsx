import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errMsg, type ChannelInput, type Mailbox, type MailboxInput, type Provider, type TestResult } from '../api';

interface ChState { enabled: boolean; host: string; port: string; secure: boolean; username: string; password: string }
const emptyCh = (port: string, secure: boolean): ChState => ({ enabled: false, host: '', port, secure, username: '', password: '' });

function ChannelFields({ label, kind, st, set, hasSaved }: {
  label: string; kind: 'imap' | 'smtp'; st: ChState; set: (p: Partial<ChState>) => void; hasSaved: boolean;
}) {
  return (
    <fieldset className="channel">
      <legend>{label}</legend>
      <label className="check">
        <input type="checkbox" checked={st.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        {kind === 'imap' ? 'IMAP aktivieren (Index und Suche)' : 'SMTP aktivieren (Versand)'}
      </label>
      {st.enabled && (
        <div className="grid2">
          <label>Server<input required value={st.host} onChange={(e) => set({ host: e.target.value })} /></label>
          <label>Port<input required type="number" min={1} max={65535} value={st.port} onChange={(e) => set({ port: e.target.value })} /></label>
          <label className="check span2">
            <input type="checkbox" checked={st.secure} onChange={(e) => set({ secure: e.target.checked })} />
            Implizites TLS ({kind === 'imap' ? '993' : '465'}); aus = STARTTLS
          </label>
          <label>Benutzername<input required autoComplete="off" value={st.username} onChange={(e) => set({ username: e.target.value })} /></label>
          <label>Passwort
            <input type="password" autoComplete="new-password" required={!hasSaved} placeholder={hasSaved ? 'unverändert' : ''} value={st.password} onChange={(e) => set({ password: e.target.value })} />
          </label>
        </div>
      )}
    </fieldset>
  );
}

export function MailboxFormPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [existing, setExisting] = useState<Mailbox | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [providerId, setProviderId] = useState('');
  const [imap, setImap] = useState<ChState>(emptyCh('993', true));
  const [smtp, setSmtp] = useState<ChState>(emptyCh('587', false));
  const [userTouched, setUserTouched] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<'' | 'test' | 'save' | 'delete'>('');
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    api<{ providers: Provider[] }>('providers').then((r) => setProviders(r.providers)).catch((e) => setErr(errMsg(e)));
  }, []);

  useEffect(() => {
    if (!id) return;
    api<{ mailboxes: Mailbox[] }>('mailboxes').then((r) => {
      const m = r.mailboxes.find((x) => x.id === id);
      if (!m) { setErr('Postfach nicht gefunden.'); return; }
      setExisting(m); setDisplayName(m.displayName); setEmail(m.email); setProviderId(m.providerId || ''); setUserTouched(true);
      setImap(m.imap ? { enabled: true, host: m.imap.host, port: String(m.imap.port), secure: m.imap.secure, username: m.imap.username, password: '' } : emptyCh('993', true));
      setSmtp(m.smtp ? { enabled: true, host: m.smtp.host, port: String(m.smtp.port), secure: m.smtp.secure, username: m.smtp.username, password: '' } : emptyCh('587', false));
      setLoaded(true);
    }).catch((e) => setErr(errMsg(e)));
  }, [id]);

  const provider = useMemo(() => providers.find((p) => p.id === providerId), [providers, providerId]);

  function pickProvider(pid: string) {
    setProviderId(pid);
    const p = providers.find((x) => x.id === pid);
    if (!p) return;
    if (p.imap) setImap((s) => ({ ...s, enabled: true, host: p.imap!.host, port: String(p.imap!.port), secure: p.imap!.secure }));
    if (p.smtp) setSmtp((s) => ({ ...s, enabled: true, host: p.smtp!.host, port: String(p.smtp!.port), secure: p.smtp!.secure }));
  }

  function changeEmail(v: string) {
    setEmail(v);
    if (!userTouched) { setImap((s) => ({ ...s, username: v })); setSmtp((s) => ({ ...s, username: v })); }
  }

  function toInput(): MailboxInput | null {
    const conv = (s: ChState): ChannelInput | null => {
      if (!s.enabled) return null;
      const c: ChannelInput = { host: s.host.trim(), port: Number(s.port), secure: s.secure, username: s.username.trim() || email };
      if (s.password) c.password = s.password;
      return c;
    };
    const body = { displayName: displayName.trim(), email: email.trim(), providerId, imap: conv(imap), smtp: conv(smtp) };
    if (!body.imap && !body.smtp) { setErr('Aktiviere mindestens IMAP oder SMTP.'); return null; }
    return body;
  }

  async function test() {
    const body = toInput(); if (!body) return;
    setBusy('test'); setErr(''); setResult(null);
    try {
      setResult(await api<TestResult>(id ? `mailboxes/${id}/test` : 'mailboxes/test', 'POST', body));
    } catch (e) {
      const b = (e as { body?: TestResult }).body;
      if (b && (b.imap || b.smtp)) setResult(b); else setErr(errMsg(e));
    } finally { setBusy(''); }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const body = toInput(); if (!body) return;
    setBusy('save'); setErr('');
    try {
      if (id) await api(`mailboxes/${id}`, 'PATCH', body); else await api('mailboxes', 'POST', body);
      nav('/');
    } catch (x) { setErr(errMsg(x)); setBusy(''); }
  }

  async function remove() {
    if (!id || !window.confirm('Postfach und zugehörigen Index wirklich entfernen?')) return;
    setBusy('delete');
    try { await api(`mailboxes/${id}`, 'DELETE'); nav('/'); } catch (x) { setErr(errMsg(x)); setBusy(''); }
  }

  if (!loaded) return <p className="muted">{err || 'Lade …'}</p>;

  const line = (name: string, r?: { ok: boolean; error?: string }) => r && (
    <li className={r.ok ? 'ok' : 'error'}>{name}: {r.ok ? 'Verbindung erfolgreich' : r.error ?? 'fehlgeschlagen'}</li>
  );

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{existing ? existing.displayName : 'Postfach hinzufügen'}</h1>
          <p className="muted">IMAP baut den Suchindex auf, SMTP erlaubt Agenten das Senden. Zugangsdaten werden verschlüsselt gespeichert.</p>
        </div>
      </header>
      <form className="card form wide" onSubmit={save}>
        <div className="grid2">
          <label>Anzeigename<input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
          <label>E-Mail-Adresse<input type="email" required value={email} onChange={(e) => changeEmail(e.target.value)} /></label>
          <label className="span2">Anbieter
            <select required value={providerId} onChange={(e) => pickProvider(e.target.value)}>
              <option value="" disabled>Anbieter wählen</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.region ? ` (${p.region})` : ''}</option>)}
            </select>
          </label>
        </div>
        {provider?.note && <p className="note">{provider.note}</p>}
        <ChannelFields label="Eingang (IMAP)" kind="imap" st={imap} set={(p) => { if (p.username !== undefined) setUserTouched(true); setImap((s) => ({ ...s, ...p })); }} hasSaved={!!existing?.imap} />
        <ChannelFields label="Ausgang (SMTP)" kind="smtp" st={smtp} set={(p) => { if (p.username !== undefined) setUserTouched(true); setSmtp((s) => ({ ...s, ...p })); }} hasSaved={!!existing?.smtp} />
        {result && <ul className="results" aria-live="polite">{line('IMAP', result.imap)}{line('SMTP', result.smtp)}</ul>}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="actions">
          <button type="button" className="btn" disabled={!!busy} onClick={() => void test()}>{busy === 'test' ? 'Teste …' : 'Verbindung testen'}</button>
          <button type="submit" className="btn primary" disabled={!!busy}>{busy === 'save' ? 'Speichere …' : 'Speichern'}</button>
          {id && <button type="button" className="btn danger" disabled={!!busy} onClick={() => void remove()}>Entfernen</button>}
        </div>
      </form>
    </>
  );
}
