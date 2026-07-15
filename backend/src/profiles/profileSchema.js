import {
  CORE_DOMAINS,
  isValidTopicId,
  PAIRED_DOMAINS,
  SUPPORTED_LANGUAGES,
  SUPPORTED_LEVELS
} from "../config/options.js";

export function validateProfile(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Profile must be an object"] };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const goal = typeof input.goal === "string" ? input.goal.trim() : "";
  if (!name) errors.push("Name is required");
  if (!SUPPORTED_LEVELS.includes(input.level)) errors.push("Level is not supported");
  if (!SUPPORTED_LANGUAGES.includes(input.language)) errors.push("Language is not supported");
  if (!Array.isArray(input.pairedDomains)) {
    errors.push("Paired domains must be an array");
  } else if (input.pairedDomains.some((domain) => !PAIRED_DOMAINS.includes(domain))) {
    errors.push("Paired domain is not supported");
  }
  if (!Array.isArray(input.selectedTopics) || input.selectedTopics.some((topicId) => !isValidTopicId(topicId))) {
    errors.push("Selected topics must contain valid topic identifiers");
  }
  if (typeof input.goal !== "string") errors.push("Goal must be a string");
  else if (goal.length > 500) errors.push("Goal cannot exceed 500 characters");

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      level: input.level,
      language: input.language,
      pairedDomains: [...new Set(input.pairedDomains)],
      selectedTopics: [...new Set(input.selectedTopics)],
      goal,
      coreDomains: [...CORE_DOMAINS]
    }
  };
}
