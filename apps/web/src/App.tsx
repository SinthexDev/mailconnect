import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { LoginPage, JoinPage } from './pages/AuthPages';
import { HomePage } from './pages/HomePage';
import { MailboxFormPage } from './pages/MailboxFormPage';
import { SearchPage } from './pages/SearchPage';
import { TokensPage } from './pages/TokensPage';
import { InvitesPage } from './pages/InvitesPage';
import { AccountPage } from './pages/AccountPage';

function Shell() {
  const { user, loading, logout } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="boot"><span className="brand brand-settle">MailConnect</span></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return (
    <div className="app">
      <aside className="rail">
        <div className="brand brand-settle">MailConnect</div>
        <nav className="nav" aria-label="Hauptnavigation">
          <NavLink to="/" end>Postfächer</NavLink>
          <NavLink to="/search">Suche</NavLink>
          <NavLink to="/tokens">Agent-Tokens</NavLink>
          {user.role === 'admin' && <NavLink to="/invites">Einladungen</NavLink>}
          <NavLink to="/account">Konto</NavLink>
        </nav>
        <div className="rail-foot">
          <span className="who" title={user.email}>{user.email}</span>
          <button type="button" className="link" onClick={() => void logout()}>Abmelden</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route element={<Shell />}>
        <Route index element={<HomePage />} />
        <Route path="mailboxes/new" element={<MailboxFormPage />} />
        <Route path="mailboxes/:id" element={<MailboxFormPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="tokens" element={<TokensPage />} />
        <Route path="invites" element={<InvitesPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
