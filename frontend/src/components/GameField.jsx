import { useCallback, useEffect, useMemo, useState } from "react";
import { partitionTopicsByDomain, artifactStatusLabel } from "../lib/productState.js";
import { CORE_DOMAIN_IDS } from "../lib/domainConstants.js";

const CORE_DOMAIN_LABELS = {
  dsa: "DSA",
  "system-design": "System Design",
  "game-theory": "Game Theory"
};

export default function GameField({
  topics,
  activeProfile,
  activeTopic,
  artifactResult,
  onTopicSelect,
  onCheckCache,
  onGenerate,
  generating,
  checkingCache,
  onNewProfile
}) {
  const [selectedNode, setSelectedNode] = useState(null);
  const [collapsed, setCollapsed] = useState({});

  const partitioned = useMemo(() => partitionTopicsByDomain(topics), [topics]);
  const artifactStatus = artifactStatusLabel(artifactResult);

  useEffect(() => {
    if (activeTopic) setSelectedNode(activeTopic.id);
  }, [activeTopic]);

  const pairedDisplay = useMemo(() => {
    if (!activeProfile?.pairedDomains) return [];
    return activeProfile.pairedDomains.filter((d) => !CORE_DOMAIN_IDS.has(d));
  }, [activeProfile]);

  const toggleCollapse = useCallback((groupId) => {
    setCollapsed((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const handleNodeClick = useCallback(
    (topicId) => {
      setSelectedNode(topicId);
      onTopicSelect(topicId);
    },
    [onTopicSelect]
  );

  const getConnections = useCallback(
    (topicId) => {
      if (!Array.isArray(topics)) return [];
      return topics.filter((t) => {
        if (!t || t.id === topicId) return false;
        return Array.isArray(t.connections) && t.connections.includes(topicId);
      });
    },
    [topics]
  );

  const busy = generating || checkingCache;

  return (
    <main className="game-field" aria-labelledby="gf-heading">
      <header className="game-field-header">
        <div>
          <p className="eyebrow">Game Field</p>
          <h2 id="gf-heading">Explore topics</h2>
          <p className="gf-subtitle">
            Select a topic to begin. Core domains are always active; you can generate artifacts for
            any connected topic.
          </p>
        </div>
        <div className="gf-header-actions">
          {artifactStatus === "cached" || artifactStatus === "generated" ? (
            <span className="artifact-status-tag cached">Artifact ready</span>
          ) : artifactResult !== null ? (
            <span className="artifact-status-tag missing">No artifact yet</span>
          ) : null}
          <button type="button" className="profile-reset-btn" onClick={onNewProfile}>
            New profile
          </button>
        </div>
      </header>

      <section className="core-domains-panel" aria-label="Permanent core domains">
        <h3 className="panel-heading">Permanent core domains</h3>
        <div className="core-card-grid">
          {partitioned.core.map((t) => (
            <article
              key={t.id}
              className={`core-card ${selectedNode === t.id ? "selected" : ""}`}
              aria-current={selectedNode === t.id ? "true" : undefined}
            >
              <button
                type="button"
                className="core-card-btn"
                onClick={() => handleNodeClick(t.id)}
                aria-label={`${t.title}, core domain`}
              >
                <span className="core-card-badge">
                  {CORE_DOMAIN_LABELS[t.id.split(".")[0]] ?? t.id.split(".")[0]}
                </span>
                <h4 className="core-card-title">{t.title}</h4>
                {t.summary ? <p className="core-card-desc">{t.summary}</p> : null}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section
        className={`paired-domains-panel ${pairedDisplay.length > 0 ? "" : "empty-panel"}`}
        aria-label="Paired topic domains"
      >
        <h3 className="panel-heading">Connected topics</h3>
        {pairedDisplay.length === 0 ? (
          <p className="empty-hint">
            No paired domains selected. Topics from your paired domains will appear here.
          </p>
        ) : (
          pairedDisplay.map((domain) => {
            const domainTopics = partitioned.paired.filter((t) => t.id.startsWith(`${domain}.`));
            if (domainTopics.length === 0) return null;
            const isCollapsed = collapsed[domain];

            return (
              <div key={domain} className="domain-bucket">
                <button
                  type="button"
                  className="bucket-header"
                  onClick={() => toggleCollapse(domain)}
                  aria-expanded={!isCollapsed}
                >
                  <span className="bucket-label">{domain}</span>
                  <span className="bucket-count">{domainTopics.length}</span>
                  <span className="collapse-icon">{isCollapsed ? "+" : "−"}</span>
                </button>
                {!isCollapsed ? (
                  <div className="bucket-nodes">
                    {domainTopics.map((t) => {
                      const conns = getConnections(t.id);
                      return (
                        <article
                          key={t.id}
                          className={`topic-card ${selectedNode === t.id ? "selected" : ""}`}
                          aria-current={selectedNode === t.id ? "true" : undefined}
                        >
                          <button
                            type="button"
                            className="topic-card-btn"
                            onClick={() => handleNodeClick(t.id)}
                            aria-label={`${t.title}${conns.length > 0 ? `, ${conns.length} connections` : ""}`}
                          >
                            <div className="topic-card-head">
                              <h4 className="topic-card-title">{t.title}</h4>
                              {conns.length > 0 ? (
                                <span className="conn-badge">
                                  {conns.length} {conns.length === 1 ? "link" : "links"}
                                </span>
                              ) : null}
                            </div>
                            {t.summary ? <p className="topic-card-desc">{t.summary}</p> : null}
                          </button>
                          {conns.length > 0 ? (
                            <div className="conn-list" aria-label={`${t.title} connections`}>
                              {conns.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className="conn-chip"
                                  onClick={() => handleNodeClick(c.id)}
                                  aria-label={`Connected: ${c.title}`}
                                >
                                  {c.title}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      {activeTopic ? (
        <section className="active-topic-panel" aria-label="Selected topic actions">
          <h3 className="panel-heading">Selected topic</h3>
          <div className="active-topic-card">
            <p className="active-topic-name">{activeTopic.title}</p>
            {activeTopic.summary ? (
              <p className="active-topic-desc">{activeTopic.summary}</p>
            ) : null}
          </div>

          <div className="topic-actions">
            <button
              type="button"
              className="action-btn action-secondary"
              onClick={onCheckCache}
              disabled={busy}
              aria-busy={checkingCache ? "true" : undefined}
              aria-label="Check for existing artifact"
            >
              {checkingCache ? "Checking cache..." : "Read cache"}
            </button>
            <button
              type="button"
              className="action-btn primary-action"
              onClick={onGenerate}
              disabled={busy}
              aria-busy={generating ? "true" : undefined}
            >
              {generating ? "Generating..." : "Generate artifact"}
            </button>
          </div>

          {artifactStatus === "cached" ? (
            <div className="artifact-feedback cached-feedback" role="status">
              <p>An artifact already exists for this topic. Generating again will replace it.</p>
            </div>
          ) : artifactStatus === "generated" ? (
            <div className="artifact-feedback generated-feedback" role="status">
              <p>Artifact generated. View it above.</p>
            </div>
          ) : artifactStatus === "not_generated" && artifactResult !== null ? (
            <div className="artifact-feedback empty-feedback" role="status">
              <p>No artifact found. Press Generate to create one.</p>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="no-topic-hint" aria-label="Topic selection">
          <p>Select a topic from the panels above to get started.</p>
        </section>
      )}
    </main>
  );
}