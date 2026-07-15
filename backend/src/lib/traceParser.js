export const TRACE_PREFIX = "REFRACT_TRACE:";

export function parseTraceEvents(stdout = "") {
  const events = [];
  const visibleLines = [];

  for (const line of String(stdout).split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!line.startsWith(TRACE_PREFIX)) {
      visibleLines.push(line);
      continue;
    }

    const raw = line.slice(TRACE_PREFIX.length).trim();
    try {
      const event = JSON.parse(raw);
      if (!event || typeof event.type !== "string") {
        visibleLines.push(`Malformed trace ignored: ${raw}`);
        continue;
      }
      events.push(event);
    } catch {
      visibleLines.push(`Malformed trace ignored: ${raw}`);
    }
  }

  return {
    events,
    stdout: visibleLines.join("\n")
  };
}
