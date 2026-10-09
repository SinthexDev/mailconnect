import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errMsg, type User } from '../api';
import { useAuth } from '../auth';

function AuthFrame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-intro">
        <div className="brand brand-settle brand-xl">MailConnect</div>
        <p>Verbinde deine IMAP- und SMTP-Postfächer, baue einen durchsuchbaren Index auf und gib Agenten gezielten Zugriff über MCP.</p>
      </div>
      <div className="card auth-card">
        <h1>{title}</h1>
        <p className="muted">{lead}</p>
        {children}
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api<{ user: User }>('auth/login', 'POST', { email, password });
      setUser(r.user);
      nav((loc.state as { from?: string } | null)?.from ?? '/', { replace: true });
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }

  return (
    <AuthFrame title="Anmelden" lead="Melde dich mit deinem MailConnect-Konto an.">
      <form className="form" onSubmit={submit}>
        <label>E-Mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Passwort<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <p className="error" role="alert">{err}</p>}
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Anmelden …' : 'Anmelden'}</button>
      </form>
    </AuthFrame>
  );
}

export function JoinPage() {
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 12) { setErr('Das Passwort braucht mindestens 12 Zeichen.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api<{ user: User }>('auth/accept-invite', 'POST', { token, email, password });
      setUser(r.user);
      nav('/', { replace: true });
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }

  return (
    <AuthFrame title="Einladung annehmen" lead="Lege E-Mail-Adresse und Passwort für dein Konto fest.">
      {!token ? <p className="error" role="alert">Der Einladungslink enthält keinen Token.</p> : (
        <form className="form" onSubmit={submit}>
          <label>E-Mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Passwort (mind. 12 Zeichen)<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {err && <p className="error" role="alert">{err}</p>}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Konto wird angelegt …' : 'Konto anlegen'}</button>
        </form>
      )}
    </AuthFrame>
  );
}
