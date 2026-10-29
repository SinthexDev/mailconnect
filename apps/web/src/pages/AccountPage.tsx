import { useEffect, useState, type FormEvent } from 'react';
import { api, errMsg } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../LanguageSwitcher';

export function AccountPage() {
  const { user, setUser } = useAuth();
  const { m } = useI18n();
  const [username, setUsername] = useState(user?.username ?? '');
  const [userMsg, setUserMsg] = useState('');
  const [userErr, setUserErr] = useState('');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setUsername(user?.username ?? '');
  }, [user?.username]);

  async function saveUsername(e: FormEvent) {
    e.preventDefault();
    setUserMsg('');
    setUserErr('');
    try {
      const r = await api<{ user: NonNullable<typeof user> }>('auth/username', 'POST', {
        username: username.trim() || null,
      });
      setUser(r.user);
      setUsername(r.user.username ?? '');
      setUserMsg(m.usernameSaved);
    } catch (x) {
      setUserErr(errMsg(x));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    setErr('');
    if (next.length < 12) {
      setErr(m.newPasswordTooShort);
      return;
    }
    try {
      await api('auth/change-password', 'POST', { currentPassword: cur, newPassword: next });
      setCur('');
      setNext('');
      setMsg(m.passwordChanged);
    } catch (x) {
      setErr(errMsg(x));
    }
  }

  const signedIn = user?.username
    ? m.signedInAsUsername(user.username, user.email)
    : m.signedInAs(user?.email ?? '');

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{m.accountTitle}</h1>
          <p className="muted">{signedIn}</p>
        </div>
      </header>
      <form className="card form wide" onSubmit={saveUsername}>
        <h2>{m.loginUsername}</h2>
        <p className="muted">{m.loginUsernameHint}</p>
        <label>
          {m.loginUsername}
          <input
            autoComplete="username"
            maxLength={32}
            placeholder={m.loginUsernamePlaceholder}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        {userErr && <p className="error" role="alert">{userErr}</p>}
        {userMsg && <p className="ok" role="status">{userMsg}</p>}
        <div className="actions">
          <button type="submit" className="btn primary">{m.saveUsername}</button>
        </div>
      </form>
      <form className="card form wide" onSubmit={submit}>
        <h2>{m.changePassword}</h2>
        <label>
          {m.currentPassword}
          <input type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} />
        </label>
        <label>
          {m.newPassword}
          <input type="password" autoComplete="new-password" minLength={12} required value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        {err && <p className="error" role="alert">{err}</p>}
        {msg && <p className="ok" role="status">{msg}</p>}
        <div className="actions">
          <button type="submit" className="btn primary">{m.changePassword}</button>
        </div>
      </form>
    </>
  );
}
