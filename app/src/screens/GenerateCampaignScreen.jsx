import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackButton } from '../components/BackButton.jsx';
import { FlowingDivider } from '../components/ornament/FlowingDivider.jsx';
import { Panel } from '../components/ornament/Panel.jsx';
import { generateCampaignSeed, importCampaignSeed } from '../lib/campaignGenerator.js';
import { useSession } from '../lib/SessionContext.jsx';

// Three sizes rather than four separate count fields — see BIBLE.md §9's
// "small, composable" bias; a DM picks roughly how much content they
// want, not an exact count per category. Values are the request body's
// numLocations/numNpcs/numFactions/numCreatures.
const SIZES = {
  small: { label: 'Small (a session or two)', numLocations: 2, numNpcs: 3, numFactions: 1, numCreatures: 2 },
  standard: { label: 'Standard (a few sessions)', numLocations: 3, numNpcs: 4, numFactions: 2, numCreatures: 3 },
  large: { label: 'Large (a full arc)', numLocations: 5, numNpcs: 6, numFactions: 3, numCreatures: 5 },
};

export function GenerateCampaignScreen() {
  const { status, guest } = useSession();
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState('');
  const [partyLevel, setPartyLevel] = useState(3);
  const [size, setSize] = useState('standard');
  const [includeNote, setIncludeNote] = useState(true);

  const [seed, setSeed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleGenerate(event) {
    event.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    setSeed(null);
    try {
      const result = await generateCampaignSeed({
        prompt: prompt.trim(),
        partyLevel,
        includeNote,
        ...SIZES[size],
      });
      setSeed(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    setBusy(true);
    setError(null);
    try {
      const campaign = await importCampaignSeed(status, guest?.role, seed);
      navigate(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '3rem 1.5rem 10rem' }}>
      <div className="screen-enter" style={{ width: 'min(640px, 100%)' }}>
        <BackButton to="/dashboard" label="Campaigns" />
        <h2 style={{ textAlign: 'center' }}>Generate a Campaign</h2>
        <p style={{ textAlign: 'center', marginTop: '0.4rem' }}>
          Describe a premise — Claude drafts a starting Encyclopedia and Bestiary you can edit like any other entry.
        </p>

        <div style={{ margin: '1.5rem 0' }}>
          <FlowingDivider />
        </div>

        {error && (
          <p className="error-text" style={{ textAlign: 'center', marginBottom: '1rem' }}>
            {error}
          </p>
        )}

        {!seed && (
          <Panel corners topRule style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="field">
                <label htmlFor="premise">Premise</label>
                <textarea
                  id="premise"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A smugglers' coast where an old sea-cult is stirring back to life…"
                  rows={4}
                  required
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="partyLevel">Party Level</label>
                <input
                  id="partyLevel"
                  type="number"
                  min={1}
                  max={20}
                  value={partyLevel}
                  onChange={(e) => setPartyLevel(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="size">Campaign Size</label>
                <select id="size" value={size} onChange={(e) => setSize(e.target.value)}>
                  {Object.entries(SIZES).map(([id, opt]) => (
                    <option key={id} value={id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" checked={includeNote} onChange={(e) => setIncludeNote(e.target.checked)} />
                Include a DM-only session-zero note
              </label>

              <button className="btn btn-primary" type="submit" disabled={busy || !prompt.trim()}>
                {busy ? 'Drafting…' : 'Draft Campaign'}
              </button>
            </form>
          </Panel>
        )}

        {seed && (
          <Panel corners topRule style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem' }}>{seed.campaign.name}</h3>
              <p style={{ marginTop: '0.4rem' }}>{seed.campaign.description}</p>
            </div>

            <div className="chip-row" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span className="chip">{seed.encyclopediaEntries.length} Encyclopedia entries</span>
              <span className="chip">{seed.bestiaryEntries.length} Bestiary creatures</span>
              {seed.notes.length > 0 && <span className="chip">{seed.notes.length} Note</span>}
            </div>

            <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {seed.encyclopediaEntries.map((entry) => (
                <li key={entry.title}>
                  <strong>{entry.title}</strong> — {entry.category}
                </li>
              ))}
              {seed.bestiaryEntries.map((creature) => (
                <li key={creature.name}>
                  <strong>{creature.name}</strong> — CR {creature.challengeRating}
                </li>
              ))}
            </ul>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" type="button" onClick={handleImport} disabled={busy}>
                {busy ? 'Creating…' : 'Create This Campaign'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setSeed(null)} disabled={busy}>
                Start Over
              </button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
