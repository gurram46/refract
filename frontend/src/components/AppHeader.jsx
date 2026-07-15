export default function AppHeader({ activeProfile, profiles, onProfileSelect, activeTopic }) {
  const hasProfiles = Array.isArray(profiles) && profiles.length > 0;

  return (
    <header className="app-header">
      <div className="brand-block" aria-label="Refract">
        <div className="brand-mark">R</div>
        <div>
          <p className="brand-kicker">Refract</p>
          <h1>Artifact Workbench</h1>
        </div>
      </div>

      <nav className="artifact-nav" aria-label="Active navigation">
        {hasProfiles && activeProfile ? (
          <>
            <span className="profile-badge">{activeProfile.language ?? "—"}</span>
            {activeTopic ? (
              <span className="topic-badge">{activeTopic.title ?? activeTopic.id}</span>
            ) : null}
          </>
        ) : (
          <span className="nav-label">Setup</span>
        )}

        {hasProfiles ? (
          <select
            className="profile-select"
            aria-label="Switch learner profile"
            value={activeProfile?.id ?? ""}
            onChange={(e) => {
              if (e.target.value) onProfileSelect(e.target.value);
            }}
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.language ?? p.id} — {p.level ?? "any"}
              </option>
            ))}
          </select>
        ) : null}
      </nav>
    </header>
  );
}