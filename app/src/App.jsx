import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DiceRoller } from './components/DiceRoller.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';
import { SessionProvider, useSession } from './lib/SessionContext.jsx';
import { AuthScreen } from './screens/AuthScreen.jsx';
import { BestiaryScreen } from './screens/BestiaryScreen.jsx';
import { CampaignHubScreen } from './screens/CampaignHubScreen.jsx';
import { CampaignIndexRedirect, CampaignScreen } from './screens/CampaignScreen.jsx';
import { CharactersScreen } from './screens/CharactersScreen.jsx';
import { EncyclopediaScreen } from './screens/EncyclopediaScreen.jsx';
import { GuestRoleScreen } from './screens/GuestRoleScreen.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { JoinCampaignScreen } from './screens/JoinCampaignScreen.jsx';
import { NotesScreen } from './screens/NotesScreen.jsx';

function RequireSession({ children }) {
  const { status } = useSession();
  if (status === 'loading') return <Splash />;
  if (status === 'signed-out') return <Navigate to="/" replace />;
  return children;
}

function Splash() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <span style={{ fontFamily: 'var(--font-display)', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
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
      <Route path="/join" element={<JoinCampaignScreen />} />
      <Route
        path="/dashboard"
        element={
          <RequireSession>
            <CampaignHubScreen />
          </RequireSession>
        }
      />
      <Route
        path="/campaigns/:campaignId"
        element={
          <RequireSession>
            <CampaignScreen />
          </RequireSession>
        }
      >
        <Route index element={<CampaignIndexRedirect />} />
        <Route path="encyclopedia" element={<EncyclopediaScreen />} />
        <Route path="notes" element={<NotesScreen />} />
        <Route path="bestiary" element={<BestiaryScreen />} />
        <Route path="characters" element={<CharactersScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ThemeToggle />
        <DiceRoller />
        <Routed />
      </BrowserRouter>
    </SessionProvider>
  );
}
