export default function PracticeTab({ artifact }) {
  const starterCode = artifact.practice?.python?.starterCode || "";

  return (
    <div className="practice-grid">
      <section className="code-preview">
        <div className="section-header">
          <div>
            <p className="eyebrow">Practice</p>
            <h3>Python starter code</h3>
          </div>
          <button type="button" disabled>Run Tests</button>
        </div>
        <pre>{starterCode}</pre>
        <p className="phase-note">Practice runtime comes next.</p>
      </section>
      <section className="trace-placeholder">
        <p className="eyebrow">Trace replay</p>
        <h3>Visual trace placeholder</h3>
        <p>After the practice runtime is added, queue events will animate here.</p>
      </section>
    </div>
  );
}
