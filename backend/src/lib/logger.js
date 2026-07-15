const SENSITIVE_KEY = /(key|token|authorization|secret|prompt)/i;
const REDACTED = "[REDACTED]";

export function createLogger({
  sink = console.log,
  now = () => new Date()
} = {}) {
  function write(level, event, metadata = {}) {
    const timestamp = now();
    const safeMetadata = isPlainRecord(metadata) ? sanitize(metadata) : {};
    sink(JSON.stringify({
      ...safeMetadata,
      timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp),
      level,
      event
    }));
  }

  return {
    info: (event, metadata) => write("info", event, metadata),
    warn: (event, metadata) => write("warn", event, metadata),
    error: (event, metadata) => write("error", event, metadata)
  };
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!isPlainRecord(value)) return value;

  return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [
    key,
    SENSITIVE_KEY.test(key) ? REDACTED : sanitize(nestedValue)
  ]));
}

function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
