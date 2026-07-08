export default function AppHeader() {
  return (
    <header className="app-header">
      <div className="brand-block" aria-label="Refract">
        <div className="brand-mark">R</div>
        <div>
          <p className="brand-kicker">Refract</p>
          <h1>Artifact Workbench</h1>
        </div>
      </div>
      <nav className="artifact-nav" aria-label="Artifact navigation">
        <button type="button" className="active" aria-current="page">Queue</button>
      </nav>
    </header>
  );
}
