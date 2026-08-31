import { useNavigate } from 'react-router-dom';

// The standing "where does this screen go back to" affordance — always
// top-left of the screen's content, never buried below the primary
// action. See BIBLE.md §9 for the full navigation map (which screen
// goes back to which).
export function BackButton({ to, label = 'Back' }) {
  const navigate = useNavigate();
  return (
    <button className="btn btn-ghost btn-small back-button" type="button" onClick={() => navigate(to)}>
      ← {label}
    </button>
  );
}
