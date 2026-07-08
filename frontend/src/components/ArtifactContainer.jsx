import StoryTab from "./tabs/StoryTab.jsx";
import ExploreTab from "./tabs/ExploreTab.jsx";
import PracticeTab from "./tabs/PracticeTab.jsx";
import ReviewTab from "./tabs/ReviewTab.jsx";

const TABS = ["story", "explore", "practice", "review"];
const TAB_LABELS = {
  story: "Story",
  explore: "Explore",
  practice: "Practice",
  review: "Review"
};

export default function ArtifactContainer({ artifact, activeTab, setActiveTab }) {
  const activeTabId = `artifact-tab-${activeTab}`;
  const activePanelId = `artifact-panel-${activeTab}`;

  return (
    <main className="workbench-shell">
      <section className="artifact-card">
        <div className="artifact-hero">
          <div>
            <p className="eyebrow">{artifact.pack}</p>
            <h2>{artifact.title}</h2>
            <p>{artifact.summary}</p>
          </div>
          <span className="artifact-level">{artifact.level}</span>
        </div>

        <div className="tab-list" role="tablist" aria-label="Artifact tabs">
          {TABS.map((tab) => {
            const tabId = `artifact-tab-${tab}`;
            const panelId = `artifact-panel-${tab}`;

            return (
              <button
                key={tab}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={panelId}
                className={activeTab === tab ? "active" : ""}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            );
          })}
        </div>

        <div id={activePanelId} className="tab-panel" role="tabpanel" aria-labelledby={activeTabId}>
          {activeTab === "story" ? <StoryTab artifact={artifact} setActiveTab={setActiveTab} /> : null}
          {activeTab === "explore" ? <ExploreTab artifact={artifact} setActiveTab={setActiveTab} /> : null}
          {activeTab === "practice" ? <PracticeTab artifact={artifact} /> : null}
          {activeTab === "review" ? <ReviewTab artifact={artifact} setActiveTab={setActiveTab} /> : null}
        </div>
      </section>

      <aside className="tutor-panel" aria-label="AI Tutor placeholder">
        <p className="eyebrow">Tutor</p>
        <h2>Quiet help, when ready</h2>
        <p>The tutor will explain, hint, and review in a later phase. For now, focus on the artifact.</p>
      </aside>
    </main>
  );
}
