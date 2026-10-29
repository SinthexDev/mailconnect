import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errMsg, type User } from '../api';
import { useAuth } from '../auth';
import { LanguageSwitcher, useI18n } from '../LanguageSwitcher';

function AuthFrame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  const { m } = useI18n();
  return (
    <div className="auth">
      <div className="auth-intro">
        <div className="auth-brandline">
          <Link className="brand brand-settle brand-xl" to="/">MailConnect</Link>
          <LanguageSwitcher />
        </div>
        <p>{m.authLead}</p>
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
  const { m } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/postfaecher" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api<{ user: User }>('auth/login', 'POST', { login, password });
      setUser(r.user);
      nav((loc.state as { from?: string } | null)?.from ?? '/postfaecher', { replace: true });
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }

  return (
    <AuthFrame title={m.loginTitle} lead={m.loginLead}>
      <form className="form" onSubmit={submit}>
        <label>{m.loginOrEmail}<input type="text" autoComplete="username" required value={login} onChange={(e) => setLogin(e.target.value)} /></label>
        <label>{m.password}<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {err && <p className="error" role="alert">{err}</p>}
        <button type="submit" className="btn primary" disabled={busy}>{busy ? m.signingIn : m.signIn}</button>
      </form>
    </AuthFrame>
  );
}

export function JoinPage() {
  const { setUser } = useAuth();
  const { m } = useI18n();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 12) { setErr(m.passwordTooShort); return; }
    setBusy(true); setErr('');
    try {
      const r = await api<{ user: User }>('auth/accept-invite', 'POST', { token, email, password });
      setUser(r.user);
      nav('/postfaecher', { replace: true });
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  }

  return (
    <AuthFrame title={m.joinTitle} lead={m.joinLead}>
      {!token ? <p className="error" role="alert">{m.missingToken}</p> : (
        <form className="form" onSubmit={submit}>
          <label>{m.email}<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>{m.passwordHint}<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {err && <p className="error" role="alert">{err}</p>}
          <button type="submit" className="btn primary" disabled={busy}>{busy ? m.creatingAccount : m.createAccount}</button>
        </form>
      )}
    </AuthFrame>
  );
}
