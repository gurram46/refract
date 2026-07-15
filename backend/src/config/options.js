const PROFILE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOPIC_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

export const CORE_DOMAINS = Object.freeze(["dsa", "system-design", "game-theory"]);
export const PAIRED_DOMAINS = Object.freeze(["language", "backend", "frontend", "ml", "ai", "data-science"]);
export const SUPPORTED_LEVELS = Object.freeze(["beginner", "intermediate", "expert"]);
export const SUPPORTED_LANGUAGES = Object.freeze(["go", "python", "javascript", "typescript", "java", "cpp", "rust"]);

export { PROFILE_ID_PATTERN, TOPIC_ID_PATTERN };

export function isValidProfileId(profileId) {
  return typeof profileId === "string" && profileId.length <= 100 && PROFILE_ID_PATTERN.test(profileId);
}

export function isValidTopicId(topicId) {
  return typeof topicId === "string" && TOPIC_ID_PATTERN.test(topicId);
}
