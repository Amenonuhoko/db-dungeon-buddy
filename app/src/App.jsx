import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { DiceRoller } from './components/DiceRoller.jsx';
import { ThemeToggle } from './components/ThemeToggle.jsx';
import { landedFromRecoveryLink, onPasswordRecovery } from './lib/session.js';
import { SessionProvider, useSession } from './lib/SessionContext.jsx';
import { AuthScreen } from './screens/AuthScreen.jsx';
import { BestiaryScreen } from './screens/BestiaryScreen.jsx';
import { CampaignHubScreen } from './screens/CampaignHubScreen.jsx';
import { CampaignIndexRedirect, CampaignScreen, RequireDM } from './screens/CampaignScreen.jsx';
import { CharacterSheetScreen } from './screens/CharacterSheetScreen.jsx';
import { CharactersScreen } from './screens/CharactersScreen.jsx';
import { ChooseCharacterScreen } from './screens/ChooseCharacterScreen.jsx';
import { CombatScreen } from './screens/CombatScreen.jsx';
import { EncyclopediaScreen } from './screens/EncyclopediaScreen.jsx';
import { GuestRoleScreen } from './screens/GuestRoleScreen.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { JoinCampaignScreen } from './screens/JoinCampaignScreen.jsx';
import { NotesScreen } from './screens/NotesScreen.jsx';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen.jsx';

function RequireSession({ children }) {
  const { status } = useSession();
  if (status === 'loading') return <Splash />;
  if (status === 'signed-out') return <Navigate to="/" replace />;
  return children;
}

// A password-reset link should always end on the new-password form. It
// normally lands on /reset-password directly, but if the deployed URL
// isn't in Supabase's Redirect URLs allow-list it lands on the Site URL
// root instead — where Home would just send the (now signed-in) visitor
// to the dashboard without ever asking for a new password. Two signals,
// either is enough: the link's `type=recovery` hash, read at load (the
// hash is carried along so the Supabase client can still exchange its
// token), and the client's own PASSWORD_RECOVERY event.
function RecoveryRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const toResetScreen = () => {
      if (!window.location.pathname.endsWith('/reset-password')) {
        navigate(`/reset-password${window.location.hash}`, { replace: true });
      }
    };
    if (landedFromRecoveryLink) toResetScreen();
    return onPasswordRecovery(toResetScreen);
  }, [navigate]);
  return null;
}

function Splash() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: 'var(--text-dim)' }}>
        Gathering the party…
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
      {/* Not behind RequireSession — it manages its own status-based
          rendering (lib/session.js's requestPasswordReset() points the
          emailed link here; ResetPasswordScreen.jsx covers why an
          already-authenticated visit here is also fine, not just a
          recovery-link one). */}
      <Route path="/reset-password" element={<ResetPasswordScreen />} />
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
        <Route
          path="encyclopedia"
          element={
            <RequireDM>
              <EncyclopediaScreen />
            </RequireDM>
          }
        />
        <Route path="notes" element={<NotesScreen />} />
        <Route
          path="bestiary"
          element={
            <RequireDM>
              <BestiaryScreen />
            </RequireDM>
          }
        />
        <Route path="characters" element={<CharactersScreen />} />
        <Route path="combat" element={<CombatScreen />} />
      </Route>
      {/* Deliberately a sibling of the campaign shell above, not nested
          under its Outlet — a character sheet is a whole-screen affair of
          its own (BIBLE.md §3/§9), with no bottom tab dock, DM/Player
          chip, or "← Campaigns" chrome borrowed from the tab screens. It
          resolves its own campaign/role via useCampaignAccess() instead
          of the shared Outlet context. */}
      {/* "Choose your character" — the step after joining, and where a
          player comes back to slip into a different one. Same standalone
          treatment as the sheet below. */}
      <Route
        path="/campaigns/:campaignId/choose"
        element={
          <RequireSession>
            <ChooseCharacterScreen />
          </RequireSession>
        }
      />
      <Route
        path="/campaigns/:campaignId/characters/:sheetId"
        element={
          <RequireSession>
            <CharacterSheetScreen />
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
        <ThemeToggle />
        <DiceRoller />
        <RecoveryRedirect />
        <Routed />
      </BrowserRouter>
    </SessionProvider>
  );
}
