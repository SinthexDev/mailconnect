import { useState, type FormEvent } from 'react';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../LanguageSwitcher';

export function AccountPage() {
  const { user } = useAuth();
  const { m } = useI18n();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg(''); setErr('');
    if (next.length < 12) { setErr(m.newPasswordTooShort); return; }
    try {
      await api('auth/change-password', 'POST', { currentPassword: cur, newPassword: next });
      setCur(''); setNext(''); setMsg(m.passwordChanged);
    } catch (x) { setErr(errMsg(x)); }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{m.accountTitle}</h1>
          <p className="muted">{m.signedInAs(user?.email ?? '')}</p>
        </div>
      </header>
      <form className="card form wide" onSubmit={submit}>
        <h2>{m.changePassword}</h2>
        <label>{m.currentPassword}<input type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label>{m.newPassword}<input type="password" autoComplete="new-password" minLength={12} required value={next} onChange={(e) => setNext(e.target.value)} /></label>
        {err && <p className="error" role="alert">{err}</p>}
        {msg && <p className="ok" role="status">{msg}</p>}
        <div className="actions"><button type="submit" className="btn primary">{m.changePassword}</button></div>
      </form>
    </>
  );
}
