import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { Home, Library as LibIcon, Users, Trophy, User } from 'lucide-react';
import './styles/app.css';
import { SessionProvider, useSession } from './lib/session.tsx';
import { Avatar, Loading } from './components/ui.tsx';
import Landing from './pages/Landing.tsx';

const Library = lazy(() => import('./pages/Library.tsx'));
const Song = lazy(() => import('./pages/Song.tsx'));
const Sing = lazy(() => import('./pages/Sing.tsx'));
const Room = lazy(() => import('./pages/Room.tsx'));
const Stage = lazy(() => import('./pages/Stage.tsx'));
const Host = lazy(() => import('./pages/Host.tsx'));
const EventPage = lazy(() => import('./pages/EventPage.tsx'));
const Auth = lazy(() => import('./pages/Auth.tsx'));
const Profile = lazy(() => import('./pages/Profile.tsx'));
const Boards = lazy(() => import('./pages/Boards.tsx'));
const Rooms = lazy(() => import('./pages/Rooms.tsx'));

function Shell() {
  const { user } = useSession();
  const loc = useLocation();
  return (
    <div className="app">
      <header className="nav">
        <Link to="/" className="brand" aria-label="Croon home">CRO<i>O</i>N</Link>
        <nav className="nav-links" aria-label="Main">
          <NavLink to="/library" className="nl">Library</NavLink>
          <NavLink to="/rooms" className="nl">Rooms</NavLink>
          <NavLink to="/host" className="nl">Host an event</NavLink>
          <NavLink to="/leaderboards" className="nl">Leaderboards</NavLink>
        </nav>
        <span className="fill" />
        {user ? (
          <Link to={`/u/${user.username}`} className="nav-me"><Avatar a={user.avatar} size={30} /><span>{user.displayName}</span></Link>
        ) : (
          <NavLink to="/signin" state={{ from: loc.pathname }} className="nl">Sign in</NavLink>
        )}
      </header>
      <main className="main" id="main">
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end><Home size={20} aria-hidden />Sing</NavLink>
        <NavLink to="/library"><LibIcon size={20} aria-hidden />Library</NavLink>
        <NavLink to="/rooms"><Users size={20} aria-hidden />Rooms</NavLink>
        <NavLink to="/leaderboards"><Trophy size={20} aria-hidden />Charts</NavLink>
        <NavLink to={user ? `/u/${user.username}` : '/signin'}><User size={20} aria-hidden />{user ? 'Me' : 'Sign in'}</NavLink>
      </nav>
    </div>
  );
}

function NotFound() {
  return (
    <div className="notfound">
      <h1>Side B is blank</h1>
      <p>There is nothing recorded at this address.</p>
      <Link to="/" className="key key-hot key-md"><span>Back to the lounge</span></Link>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/stage/:code" element={<Suspense fallback={<Loading />}><Stage /></Suspense>} />
          <Route element={<Shell />}>
            <Route index element={<Landing />} />
            <Route path="library" element={<Library />} />
            <Route path="song/:key" element={<Song />} />
            <Route path="sing/:key" element={<Sing />} />
            <Route path="rooms" element={<Rooms />} />
            <Route path="r/:code" element={<Room />} />
            <Route path="host" element={<Host />} />
            <Route path="e/:id" element={<EventPage />} />
            <Route path="signin" element={<Auth mode="signin" />} />
            <Route path="signup" element={<Auth mode="signup" />} />
            <Route path="recover" element={<Auth mode="recover" />} />
            <Route path="u/:username" element={<Profile />} />
            <Route path="leaderboards" element={<Boards />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  </StrictMode>,
);
