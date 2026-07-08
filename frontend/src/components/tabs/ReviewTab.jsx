export default function ReviewTab({ artifact, setActiveTab }) {
  return (
    <div className="review-grid">
      <section>
        <p className="eyebrow">Review</p>
        <h3>Run code first to get review.</h3>
        <p>Review will use your latest code, test result, trace summary, and this rubric.</p>
        <button type="button" className="primary-action" onClick={() => setActiveTab("practice")}>Back to Practice</button>
      </section>
      <section className="rubric-card">
        <h3>Rubric</h3>
        <ul>
          {artifact.rubric?.map((item) => (
            <li key={item.dimension}>
              <span>{item.label}</span>
              <strong>{item.weight}%</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
