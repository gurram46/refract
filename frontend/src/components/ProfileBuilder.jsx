import { useCallback, useEffect, useState } from "react";

const PAIRED_DOMAIN_FALLBACK_LABELS = {
  language: "Language",
  backend: "Backend",
  frontend: "Frontend",
  ml: "ML",
  ai: "AI",
  "data-science": "Data Science"
};

export default function ProfileBuilder({ options, onSave, saveDisabled }) {
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("");
  const [level, setLevel] = useState("");
  const [goal, setGoal] = useState("");
  const [selectedPaired, setSelectedPaired] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (options) {
      if (options.languages?.length === 1) setLanguage(options.languages[0]);
      if (options.levels?.length === 1) setLevel(options.levels[0]);
    }
  }, [options]);

  const pairedDomainItems = useCallback(() => {
    const raw = options?.pairedDomains ?? [];
    if (raw.length > 0) {
      return raw.map((d) => {
        const id = typeof d === "object" ? d.id : d;
        const label = typeof d === "object" ? d.label ?? d.title ?? id : PAIRED_DOMAIN_FALLBACK_LABELS[id] ?? id;
        return { id, label };
      });
    }
    return Object.keys(PAIRED_DOMAIN_FALLBACK_LABELS).map((id) => ({
      id,
      label: PAIRED_DOMAIN_FALLBACK_LABELS[id]
    }));
  }, [options]);

  const validate = useCallback(() => {
    const next = {};
    if (!name.trim()) next.name = "Please enter a profile name.";
    else if (name.trim().length > 200) next.name = "Profile name must be under 200 characters.";
    if (!language) next.language = "Please select a language.";
    if (!level) next.level = "Please select an experience level.";
    if (!goal.trim()) next.goal = "Please describe your learning goal.";
    else if (goal.trim().length > 500) next.goal = "Goal must be under 500 characters.";
    if (selectedPaired.length === 0) next.paired = "Pick at least one paired domain.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [name, language, level, goal, selectedPaired]);

  const togglePaired = useCallback((domainId) => {
    setSelectedPaired((prev) =>
      prev.includes(domainId) ? prev.filter((d) => d !== domainId) : [...prev, domainId]
    );
  }, []);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault();
    if (!validate()) return;
    onSave({
      name: name.trim(),
      language,
      level,
      goal: goal.trim(),
      pairedDomains: [...selectedPaired],
      selectedTopics: selectedTopicId ? [selectedTopicId] : []
    });
  }, [validate, onSave, name, language, level, goal, selectedPaired, selectedTopicId]);

  const languages = options?.languages ?? [];
  const levels = options?.levels ?? [];
  const pairedChoices = pairedDomainItems();
  const coreDomains = options?.coreDomains ?? [];

  return (
    <main className="profile-builder" aria-labelledby="pb-heading">
      <header className="builder-header">
        <p className="eyebrow">Setup</p>
        <h2 id="pb-heading">Build your profile</h2>
        <p className="builder-intro">
          Choose a language, experience level, and what you want to learn. Core domains (DSA,
          system design, game theory) are permanent and always included.
        </p>
      </header>

      <form className="builder-form" onSubmit={handleSubmit} noValidate>
        <div className="field-group">
          <label htmlFor="pb-name" className="field-label">Profile name</label>
          <input
            id="pb-name"
            type="text"
            className={errors.name ? "field-input field-error" : "field-input"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
            aria-describedby={errors.name ? "pb-name-err" : undefined}
          />
          {errors.name ? (
            <span id="pb-name-err" className="field-hint field-hint-error" role="alert">{errors.name}</span>
          ) : null}
        </div>

        <div className="field-group">
          <label htmlFor="pb-language" className="field-label">Language</label>
          <select
            id="pb-language"
            className={errors.language ? "field-select field-error" : "field-select"}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            required
            aria-describedby={errors.language ? "pb-language-err" : undefined}
          >
            <option value="">Select language...</option>
            {languages.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          {errors.language ? (
            <span id="pb-language-err" className="field-hint field-hint-error" role="alert">{errors.language}</span>
          ) : null}
        </div>

        <div className="field-group">
          <label htmlFor="pb-level" className="field-label">Experience level</label>
          <select
            id="pb-level"
            className={errors.level ? "field-select field-error" : "field-select"}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            required
            aria-describedby={errors.level ? "pb-level-err" : undefined}
          >
            <option value="">Select level...</option>
            {levels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          {errors.level ? (
            <span id="pb-level-err" className="field-hint field-hint-error" role="alert">{errors.level}</span>
          ) : null}
        </div>

        <div className="field-group">
          <label htmlFor="pb-goal" className="field-label">Learning goal</label>
          <textarea
            id="pb-goal"
            className={errors.goal ? "field-textarea field-error" : "field-textarea"}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            maxLength={500}
            rows={3}
            required
            aria-describedby={errors.goal ? "pb-goal-err" : undefined}
          />
          {errors.goal ? (
            <span id="pb-goal-err" className="field-hint field-hint-error" role="alert">{errors.goal}</span>
          ) : null}
        </div>

        <fieldset className="paired-fieldset">
          <legend className="field-label">Paired domains</legend>
          <p className="field-description">Pick the areas you want to pair with core domains.</p>
          <div className="paired-grid" role="group" aria-label="Paired domain options">
            {pairedChoices.map(({ id, label }) => (
              <label key={id} className="paired-chip">
                <input
                  type="checkbox"
                  checked={selectedPaired.includes(id)}
                  onChange={() => togglePaired(id)}
                  className="paired-checkbox"
                />
                <span className="chip-label">{label}</span>
              </label>
            ))}
          </div>
          {errors.paired ? (
            <span className="field-hint field-hint-error" role="alert">{errors.paired}</span>
          ) : null}
        </fieldset>

        <div className="field-group">
          <label htmlFor="pb-topic" className="field-label">Starting topic</label>
          <select
            id="pb-topic"
            className="field-select"
            value={selectedTopicId}
            onChange={(e) => setSelectedTopicId(e.target.value)}
          >
            <option value="">Any matching topic</option>
            {options?.topics?.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>

        <div className="builder-actions">
          <button
            type="submit"
            className="primary-action"
            disabled={saveDisabled}
          >
            Save profile &amp; continue
          </button>
        </div>
      </form>

      {coreDomains.length > 0 ? (
        <aside className="core-domains-display" aria-label="Permanent core domains">
          <p className="eyebrow">Permanent core</p>
          <ul className="core-domain-list">
            {coreDomains.map((d) => (
              <li key={d.id ?? d} className="core-domain-item">
                <span className="core-domain-name">{typeof d === "object" ? d.title ?? d.id : d}</span>
                {typeof d === "object" && d.description ? (
                  <span className="core-domain-desc">{d.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}
    </main>
  );
}