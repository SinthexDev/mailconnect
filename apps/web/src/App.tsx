import { Link, Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { LoginPage, JoinPage } from './pages/AuthPages';
import { HomePage } from './pages/HomePage';
import { MailboxFormPage } from './pages/MailboxFormPage';
import { SearchPage } from './pages/SearchPage';
import { TokensPage } from './pages/TokensPage';
import { InvitesPage } from './pages/InvitesPage';
import { AccountPage } from './pages/AccountPage';
import { LanguageSwitcher, useI18n } from './LanguageSwitcher';
import { LandingPage } from './pages/LandingPage';
import { ChangelogPage } from './pages/ChangelogPage';
import { ImpressumPage, PrivacyPage } from './pages/LegalPages';

function Shell() {
  const { user, loading, logout } = useAuth();
  const { m } = useI18n();
  const loc = useLocation();
  if (loading) return <div className="boot"><span className="brand brand-settle">MailConnect</span></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return (
    <div className="app">
      <aside className="rail">
        <Link className="brand brand-settle" to="/">MailConnect</Link>
        <nav className="nav" aria-label={m.navMain}>
          <NavLink to="/postfaecher" end>{m.mailboxes}</NavLink>
          <NavLink to="/search">{m.search}</NavLink>
          <NavLink to="/tokens">{m.tokens}</NavLink>
          {user.role === 'admin' && <NavLink to="/invites">{m.invites}</NavLink>}
          <NavLink to="/account">{m.account}</NavLink>
        </nav>
        <div className="rail-foot">
          <LanguageSwitcher />
          <span className="who" title={user.email}>{user.email}</span>
          <button type="button" className="link" onClick={() => void logout()}>{m.logout}</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/changelog" element={<ChangelogPage />} />
      <Route path="/impressum" element={<ImpressumPage />} />
      <Route path="/datenschutz" element={<PrivacyPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/join" element={<JoinPage />} />
      <Route element={<Shell />}>
        <Route path="postfaecher" element={<HomePage />} />
        <Route path="mailboxes/new" element={<MailboxFormPage />} />
        <Route path="mailboxes/:id" element={<MailboxFormPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="tokens" element={<TokensPage />} />
        <Route path="invites" element={<InvitesPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/postfaecher" replace />} />
      </Route>
    </Routes>
  );
}
