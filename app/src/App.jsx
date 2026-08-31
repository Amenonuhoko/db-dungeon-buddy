import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './lib/SessionContext.jsx';
import { AuthScreen } from './screens/AuthScreen.jsx';
import { DashboardScreen } from './screens/DashboardScreen.jsx';
import { GuestRoleScreen } from './screens/GuestRoleScreen.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';

function RequireSession({ children }) {
  const { status } = useSession();
  if (status === 'loading') return <Splash />;
  if (status === 'signed-out') return <Navigate to="/" replace />;
  return children;
}

function Splash() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <span style={{ fontFamily: 'var(--font-display)', color: 'var(--marble-dim)', letterSpacing: '0.1em' }}>
        AWAKENING THE CODEX…
      </span>
    </div>
  );
}

function Routed() {
  const { status } = useSession();
  return (
    <Routes>
      <Route path="/" element={status === 'loading' ? <Splash /> : <HomeScreen />} />
      <Route path="/guest" element={<GuestRoleScreen />} />
      <Route path="/login" element={<AuthScreen />} />
      <Route
        path="/dashboard"
        element={
          <RequireSession>
            <DashboardScreen />
          </RequireSession>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routed />
      </BrowserRouter>
    </SessionProvider>
  );
}
