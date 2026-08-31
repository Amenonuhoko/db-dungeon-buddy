import { useNavigate } from 'react-router-dom';
import { GreekKeyRule } from '../components/ornament/GreekKeyRule.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { useSession } from '../lib/SessionContext.jsx';

const ROLE_LABEL = { dm: 'Dungeon Master', player: 'Player' };

export function DashboardScreen() {
  const { status, guest, user, logOut } = useSession();
  const navigate = useNavigate();

  const name = status === 'guest' ? guest.displayName : user?.user_metadata?.display_name || user?.email;
  const roleLine =
    status === 'guest' ? ROLE_LABEL[guest.role] : 'Account — pick a campaign to see your role there';

  async function handleLogOut() {
    await logOut();
    navigate('/');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
      <div style={{ width: 'min(560px, 100%)', textAlign: 'center' }}>
        <h2>Welcome, {name}</h2>
        <p style={{ marginTop: '0.4rem' }}>{roleLine}</p>

        <div style={{ margin: '1.5rem 0' }}>
          <GreekKeyRule />
        </div>

        <Panel corners>
          <p>
            The campaign hall isn't built yet — encyclopedia, bestiary, character sheets, notes, and the
            battle tracker are next on the roadmap (see BIBLE.md §8). This screen exists so the guest/login
            flow has somewhere to land.
          </p>
          <div style={{ marginTop: '1.5rem' }}>
            <button className="btn btn-ghost" onClick={handleLogOut}>
              {status === 'guest' ? 'Leave Table' : 'Log Out'}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
