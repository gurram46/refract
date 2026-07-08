# Engineering Standards

How we keep this repo sane. Read this before changing code.

---

## 1. Core Principles

- Prefer boring, obvious code.
- Keep changes scoped. One PR, one purpose.
- Make the happy path easy to read.
- Do not add abstractions before there are at least two real call sites.
- Preserve Visual Mode even when changing Practice Mode.
- Runner code must stay local-first and safe by default.

---

## 2. Repository Boundaries

| Location | What goes here |
|---|---|
| Root markdown | README, CONTRIBUTING, RULES, progress, profile, code-quality |
| `dsa/` | Data structure and algorithm concept files |
| `system-design/` | System design concepts connected to DSA |
| `game-theory/` | Strategic thinking concepts |
| `backend/` | Real server and SQL code per language |
| `languages/` | Language-specific concept templates |
| `prompts/` | Session start prompts for AI models |
| `profile-site/` | Profile dashboard frontend |
| `canvas/src/` | Browser UI: Visual Mode, Practice Mode, canvas rendering |
| `canvas/runner/` | Local Node server: run code, evaluate, serve lessons |

Do not mix concerns across these boundaries. If a change touches `canvas/src/` and `dsa/` at the same time, it is probably too broad.

---

## 3. Canvas UI Standards

- Visual Mode must work without the local runner.
- Practice Mode may depend on the runner.
- Keep UI states explicit: loading, ready, error, empty.
- Do not hide errors. Show them with enough context to act on.
- Avoid nesting panels inside panels.
- Keep text short and concrete.
- Controls should say what they do. "Run Tests", not "Execute".

---

## 4. Runner Standards

- Runner binds only to `127.0.0.1`.
- No silent installs. If a runtime is missing, show install instructions.
- No global file writes unless the user asks.
- Execute user code in temp workspaces. Clean up after each run.
- Always use timeouts. Five seconds is the current default.
- Return JSON from every endpoint.
- Missing resources return 404, not 500. Example: `GET /lesson/nope` returns `{ "error": "Lesson not found" }` with status 404.
- User errors return clear messages.
- Never log API keys.

---

## 5. Runtime Adapter Standards

Every adapter must expose the same shape:

- `detect()` — check if the runtime is installed
- `run()` — execute code and return results
- `trace()` — extract trace events from output
- `installInstructions()` — return setup steps for a missing runtime
- `formatError()` — turn a runtime error into a readable message

For v0.2, only JavaScript is implemented in `canvas/runner/adapters/javascript.js`. Future Go, Python, and SQL adapters must follow the same contract.

---

## 6. Trace Event Standards

User code emits trace events through `console.log`:

```
REFRACT_TRACE: {"type":"queue.enqueue","value":"A"}
```

Rules:

- Trace lines must start with `REFRACT_TRACE:`.
- JSON after the prefix must be valid.
- The parser ignores normal stdout lines.
- Malformed trace lines should not crash the run. Push them into visible output instead.
- Event names use `domain.action` format:
  - `queue.enqueue`
  - `queue.dequeue`
  - `stack.push`
  - `stack.pop`
  - `http.request`
  - `ml.loss`
  - `game.choice`

The parser lives in `canvas/runner/trace/parser.js`. It splits stdout into trace events and visible output.

---

## 7. Lesson Standards

Lesson files live in `canvas/runner/lessons/`.

Rules:

- One lesson per JSON file.
- File name is the lesson id. `queues-js.json` becomes the id `queues-js`.
- IDs use lowercase letters, numbers, and hyphens.
- Do not put generated code fences inside model-generated JSON unless already validated.
- Each lesson must include these fields:
  - `id`
  - `domain`
  - `language`
  - `concept`
  - `explanation`
  - `visualBlock`
  - `practice.prompt`
  - `practice.starterCode`
  - `practice.tests`
  - `rubric`

Starter code must include `trace.event(...)` calls or comments hinting at them. Without trace events, tests pass but the visual trace stays empty.

---

## 8. Harness / Evaluator Standards

The evaluator sends code and test results to an OpenAI-compatible API and returns feedback.

Rules:

- Start with OpenAI-compatible API only.
- API keys stay local. Never sent to the runner logs or any external service besides the configured provider.
- Missing evaluator config returns `{ status: "not_configured", success: false }`.
- Provider failure returns `{ status: "request_failed", success: false }`.
- Empty model output returns `{ status: "empty_response", success: false }`.
- Successful evaluation returns `{ status: "ok", success: true }`.
- Do not add CLI harness wrappers until the local practice loop is stable.

The harness lives in `canvas/runner/harness/openai-compatible.js`.

---

## 9. Error Handling

Rules:

- Prefer explicit error objects over thrown strings.
- Frontend should show actionable errors. Tell the user what to do next.
- Backend should return status codes that match the problem.
- `404` for missing lesson.
- `400` for bad input.
- `500` only for unexpected internal failure.
- When `loadLesson` cannot find the file, return 404 JSON. Do not let it bubble into a 500.

---

## 10. Testing Checklist

Before saying a change is done:

- `npm run build` from `canvas/` passes.
- Runner syntax check: `node --check canvas/runner/server.js`.
- `GET /health` returns 200.
- `GET /lesson/queues-js` returns the lesson JSON.
- `GET /lesson/nope` returns 404.
- `POST /run` with a passing JS solution returns `success: true`.
- `POST /run` with a failing JS solution returns `success: false`.
- Visual Mode still renders a `refract-canvas` block.

---

## 11. Human Review Checklist

Use this when reviewing a PR:

- Does this make the project easier to understand?
- Is the change smaller than it could be? Can we cut scope?
- Are errors visible to the user?
- Did we keep Visual Mode independent of the runner?
- Did we avoid adding a new abstraction too early?
- Would a beginner understand the UI text?
- Can a future maintainer delete this easily if it fails?

---

## 12. Writing Style

Rules for docs and UI copy:

- Use short sentences.
- Say exactly what the user should do.
- Avoid hype.
- Avoid fake enthusiasm.
- Avoid generic AI phrasing.
- Prefer examples over explanation.
- Do not write these words: seamless, robust, unlock, elevate, delve, utilize, leverage, revolutionary, game-changing, cutting-edge.
