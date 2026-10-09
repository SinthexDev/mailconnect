import { useState, type FormEvent } from 'react';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';

export function AccountPage() {
  const { user } = useAuth();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault(); setMsg(''); setErr('');
    if (next.length < 12) { setErr('Das neue Passwort braucht mindestens 12 Zeichen.'); return; }
    try {
      await api('auth/change-password', 'POST', { currentPassword: cur, newPassword: next });
      setCur(''); setNext(''); setMsg('Passwort geändert.');
    } catch (x) { setErr(errMsg(x)); }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Konto</h1>
          <p className="muted">Angemeldet als {user?.email}.</p>
        </div>
      </header>
      <form className="card form wide" onSubmit={submit}>
        <h2>Passwort ändern</h2>
        <label>Aktuelles Passwort<input type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label>Neues Passwort (mind. 12 Zeichen)<input type="password" autoComplete="new-password" minLength={12} required value={next} onChange={(e) => setNext(e.target.value)} /></label>
        {err && <p className="error" role="alert">{err}</p>}
        {msg && <p className="ok" role="status">{msg}</p>}
        <div className="actions"><button type="submit" className="btn primary">Passwort ändern</button></div>
      </form>
    </>
  );
}
