# Refract foundation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tested backend contracts that let Refract create user profiles, resolve connected learning sources, generate validated artifacts through MiniMax M3 with DeepSeek V4 Pro fallback, cache artifacts, and persist bounded artifact memory.

**Architecture:** Keep Express handlers thin and implement domain behavior in focused ES modules. Use injected filesystem, logger, fetch, clock, and path roots in tests. Preserve the existing Queue seed and Python runner while adding the generated artifact runtime beside them.

**Tech stack:** Node.js ES modules, Express 4, built-in `node:test`, built-in `fetch`, JSON and Markdown source files, local filesystem storage

## Global constraints

- Permanent core domains are `dsa`, `system-design`, and `game-theory`
- User-selected paired domains are `language`, `backend`, `frontend`, `ml`, `ai`, and `data-science`
- Do not create hardcoded Sandeep or Sister product profiles
- Use `minimaxai/minimax-m3` as primary and `deepseek-ai/deepseek-v4-pro` as fallback
- Every provider request includes explicit `max_tokens`
- Provider secrets and provider jargon remain backend-only
- Reading a cached artifact never calls a provider
- Generated artifacts are structured data and cannot contain executable UI code
- All filesystem identifiers and graph paths require validation
- Use asynchronous filesystem operations and atomic writes
- Keep request bodies, provider calls, artifacts, and memory bounded
- Do not call NVIDIA from automated tests
- Do not commit unless the lead agent explicitly requests it
- Follow `docs/superpowers/specs/2026-07-10-refract-foundation-design.md`

## File map

Create these focused modules:

```text
curriculum/topic-graph.json                  versioned connected learning graph
backend/src/config/options.js                supported profile values and permanent core domains
backend/src/lib/loadEnv.js                   backend-only .env loading
backend/src/lib/logger.js                    structured safe logging
backend/src/profiles/profileSchema.js        profile validation and normalization
backend/src/profiles/profileStore.js         local profile persistence
backend/src/topics/topicGraph.js             graph validation and source resolution
backend/src/artifacts/artifactSchema.js       generated artifact validation
backend/src/artifacts/artifactCache.js        validated atomic cache reads and writes
backend/src/artifacts/promptBuilder.js         bounded generation context construction
backend/src/artifacts/artifactGenerator.js    cache, provider, repair, validation orchestration
backend/src/memory/sessionStore.js            bounded artifact session memory
backend/test/*.test.js                        focused unit and integration tests
```

Modify these integration files:

```text
backend/src/lib/aiProvider.js
backend/src/app.js
backend/src/server.js
backend/package.json
backend/smoke-test.js
```

### Task 1: Profile and connected topic contracts

**Owner:** MiniMax

**Files:**
- Create: `backend/src/config/options.js`
- Create: `backend/src/profiles/profileSchema.js`
- Create: `backend/src/profiles/profileStore.js`
- Create: `backend/src/topics/topicGraph.js`
- Create: `curriculum/topic-graph.json`
- Create: `backend/test/profiles-and-topics.test.js`
- Modify: `backend/package.json`

**Interfaces:**
- Produces: `CORE_DOMAINS`, `PAIRED_DOMAINS`, `SUPPORTED_LEVELS`, `SUPPORTED_LANGUAGES`
- Produces: `validateProfile(input) -> { ok, value?, errors? }`
- Produces: `createProfileStore({ dataDir, fs?, now? }) -> { list, get, save }`
- Produces: `createTopicGraph({ repoRoot, graphPath?, fs?, logger? }) -> { load, list, get, resolveContext }`
- `resolveContext(topicId, profile)` returns `{ primary, core, paired, adjacent }` with source text attached only to `primary`, `core`, and `paired`

- [ ] **Step 1: Configure the built-in test runner**

Change the backend test script to run focused tests before the existing smoke test:

```json
"test": "node --test test/*.test.js && node smoke-test.js"
```

- [ ] **Step 2: Write failing profile validation tests**

Cover these exact behaviors with `node:test` and `node:assert/strict`:

```js
const valid = validateProfile({
  name: "Local learner",
  level: "beginner",
  language: "go",
  pairedDomains: ["backend"],
  selectedTopics: ["dsa.queue"],
  goal: "Build reliable services"
});
assert.equal(valid.ok, true);
assert.deepEqual(valid.value.coreDomains, ["dsa", "system-design", "game-theory"]);
```

Also reject unsupported domains, unknown levels, malformed topic identifiers, empty names, and goals over 500 characters.

- [ ] **Step 3: Run the focused test and verify failure**

Run: `node --test test/profiles-and-topics.test.js`

Expected: FAIL because the profile and graph modules do not exist.

- [ ] **Step 4: Implement profile validation and atomic persistence**

Generate profile IDs from normalized names plus a collision-safe suffix. Store profiles under `<dataDir>/profiles/<profileId>.json`. Write to `<path>.tmp` before rename. Reject invalid IDs rather than substituting a default profile.

The normalized profile shape is:

```js
{
  id,
  name,
  level,
  language,
  pairedDomains,
  selectedTopics,
  goal,
  coreDomains: ["dsa", "system-design", "game-theory"],
  createdAt,
  updatedAt
}
```

- [ ] **Step 5: Add the versioned topic graph**

Include `dsa.queue` as the first primary node. Connect it to available sources under `system-design/`, `game-theory/`, `backend/go/`, and `languages/go/`. Use repository-relative paths and declare `allowedVisualKinds: ["queue"]` for `dsa.queue`.

Each graph node uses this shape:

```js
{
  id: "dsa.queue",
  title: "Queue",
  domain: "dsa",
  source: "dsa/queues.md",
  allowedVisualKinds: ["queue"],
  connections: ["system-design.map", "game-theory.concepts", "backend.go.concurrency"]
}
```

- [ ] **Step 6: Implement safe graph loading and resolution**

Reject duplicate node IDs, unknown connection IDs, unsupported domains, absolute paths, and resolved paths outside `repoRoot`. Load the graph once per instance. Read only sources selected by the requested topic, permanent core, and profile pairings.

- [ ] **Step 7: Run focused tests**

Run: `node --test test/profiles-and-topics.test.js`

Expected: PASS for profile creation without defaults, permanent core injection, graph resolution, missing optional source reporting, and path traversal rejection.

- [ ] **Step 8: Lead review checkpoint**

Return files changed, public interfaces, tests run, and unresolved graph-content gaps. Do not edit provider, artifact, route, or frontend files.

### Task 2: Environment, logging, and NVIDIA provider chain

**Owner:** DeepSeek

**Files:**
- Create: `backend/src/lib/loadEnv.js`
- Create: `backend/src/lib/logger.js`
- Create: `backend/test/provider-and-logging.test.js`
- Modify: `backend/src/lib/aiProvider.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Produces: `loadEnv({ env, envPath, fs? }) -> Promise<{ loaded, configuredKeys }>`
- Produces: `createLogger({ sink?, now? }) -> { info, warn, error }`
- Produces: `createAiProvider({ env?, fetchImpl?, logger? }) -> { status, complete }`
- `complete({ messages, maxTokens? })` returns `{ content, model, fallbackUsed }`
- Preserve compatibility exports `aiStatus()` and `handleAiRequest(kind, body)` for existing routes

- [ ] **Step 1: Write failing environment and redaction tests**

Test that `.env` parsing supports plain `KEY=value`, ignores comments, does not overwrite existing environment values, and returns configured key names without values. Capture logger output and assert a known API key string never appears after logging nested metadata.

- [ ] **Step 2: Write failing provider tests**

Use injected fake `fetch` functions to prove:

```js
assert.equal(firstRequest.model, "minimaxai/minimax-m3");
assert.equal(firstRequest.max_tokens, 4096);
assert.equal(secondRequest.model, "deepseek-ai/deepseek-v4-pro");
```

Trigger fallback for non-2xx status, timeout, missing choices, blank content, and malformed response JSON. Assert logs contain model, status, duration, and content presence but not authorization headers or prompts.

- [ ] **Step 3: Run provider tests and verify failure**

Run: `node --test test/provider-and-logging.test.js`

Expected: FAIL against the current DeepSeek-primary provider.

- [ ] **Step 4: Implement environment loading and structured logger**

Emit one JSON object per log call with `timestamp`, `level`, `event`, and sanitized metadata. Redact keys matching `key`, `token`, `authorization`, `secret`, and `prompt`, case-insensitively and recursively.

- [ ] **Step 5: Refactor the provider behind an injected factory**

Use these defaults:

```js
const DEFAULT_MODEL = "minimaxai/minimax-m3";
const DEFAULT_FALLBACK_MODEL = "deepseek-ai/deepseek-v4-pro";
const DEFAULT_MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 30_000;
```

Log stable provider events from the design specification. Throw typed errors with stable codes. Do not swallow fallback errors.

- [ ] **Step 6: Load environment values before creating the app**

Update `server.js` to await environment loading, log `env.loaded`, log provider configuration without values, create the app, and log `server.started`.

- [ ] **Step 7: Run focused tests**

Run: `node --test test/provider-and-logging.test.js`

Expected: PASS for defaults, `max_tokens`, fallback, empty content, timeout, and redaction.

- [ ] **Step 8: Lead review checkpoint**

Return files changed, request-body contract, log examples with fake values, tests run, and remaining compatibility risks. Do not edit profile, graph, artifact, route, or frontend files.

### Task 3: Generated artifact validation and cache

**Owner:** DeepSeek after Tasks 1 and 2 pass lead review

**Files:**
- Create: `backend/src/artifacts/artifactSchema.js`
- Create: `backend/src/artifacts/artifactCache.js`
- Create: `backend/test/artifact-schema-and-cache.test.js`

**Interfaces:**
- Consumes: topic node `allowedVisualKinds` and normalized profile language
- Produces: `validateArtifact(value, { profileId, topicId, allowedVisualKinds, language })`
- Produces: `createArtifactCache({ generatedRoot, validator, fs?, logger? }) -> { read, write }`

- [ ] **Step 1: Write failing generated artifact contract tests**

Use a valid Queue fixture with this top-level shape:

```js
{
  schemaVersion: 1,
  artifactVersion: 1,
  profileId: "local-learner-a1b2",
  topicId: "dsa.queue",
  title: "The overloaded payment lane",
  summary: "Learn FIFO through a constrained retry system.",
  connections: { core: [], paired: [] },
  story: { premise: "...", objective: "...", decisions: [], audioScript: "..." },
  visual: { kind: "queue", initialState: { items: [] }, controls: [] },
  examples: [],
  practice: { language: "go", prompt: "...", starterCode: "...", tests: "...", supportedTraceEvents: ["queue.enqueue", "queue.dequeue"] },
  chat: { suggestedQuestions: [] },
  next: []
}
```

Reject wrong identifiers, wrong language, unsupported visuals, missing story, invalid trace event names, excessive artifact size, and forbidden fields such as `html`, `jsx`, `componentCode`, or `executableCode` at any depth.

- [ ] **Step 2: Run schema tests and verify failure**

Run: `node --test test/artifact-schema-and-cache.test.js`

Expected: FAIL because schema and cache modules do not exist.

- [ ] **Step 3: Implement explicit validation**

Return `{ ok: false, errors: [{ path, code, message }] }` instead of throwing for content errors. Keep validation functions small and reusable. Cap serialized artifacts at 512 KB.

- [ ] **Step 4: Implement validated atomic cache behavior**

Use `generated/artifacts/<profileId>/<topicId>/artifact.json`. Validate IDs before joining paths. A missing cache returns `{ status: "miss" }`. An invalid cache returns `{ status: "invalid", errors }`. A write validates before creating directories and atomically renaming the temporary file.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/artifact-schema-and-cache.test.js`

Expected: PASS, including proof that invalid artifacts never create cache files.

- [ ] **Step 6: Lead review checkpoint**

Return fixture shape, validation errors, cache path behavior, tests run, and risks. Do not edit routes or frontend files.

### Task 4: Prompt context and generate-once orchestration

**Owner:** DeepSeek

**Files:**
- Create: `backend/src/artifacts/promptBuilder.js`
- Create: `backend/src/artifacts/artifactGenerator.js`
- Create: `backend/test/artifact-generation.test.js`

**Interfaces:**
- Consumes: profile store, topic graph, artifact cache, AI provider, logger
- Produces: `buildArtifactMessages({ profile, topicContext }) -> messages`
- Produces: `createArtifactGenerator(dependencies) -> { get, generate }`
- `get(profileId, topicId)` never calls the provider
- `generate(profileId, topicId)` returns a valid cache hit or generates, repairs once, validates, caches, and returns

- [ ] **Step 1: Write failing orchestration tests**

Use fakes to assert:

- A cache hit makes zero provider calls
- `get` on a miss makes zero provider calls
- Generation context includes all three permanent core domains
- Generation context includes only selected paired-domain sources
- Primary valid output is cached once
- Invalid primary output receives one repair request with concise validation errors
- A second invalid output returns `generation_failed` and creates no cache file

- [ ] **Step 2: Run generation tests and verify failure**

Run: `node --test test/artifact-generation.test.js`

Expected: FAIL because prompt and generator modules do not exist.

- [ ] **Step 3: Implement bounded prompt construction**

Use one system message containing the artifact JSON contract and safety rules. Use one user message containing normalized profile data and resolved topic sources. Cap each Markdown source and total prompt size. Exclude API keys, local absolute paths, previous provider responses, and unrelated graph nodes.

- [ ] **Step 4: Implement generate-once orchestration**

Parse JSON whether the provider returns a raw object string or a fenced JSON block. Never evaluate returned text. Retry validation once with a compact error list. Emit all generation, validation, and cache events from the specification.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/artifact-generation.test.js`

Expected: PASS for cache, bounded context, generation, repair, and failure behavior.

- [ ] **Step 6: Lead review checkpoint**

Return provider call counts from tests, prompt size limits, emitted events, tests run, and unresolved risks.

### Task 5: Bounded artifact session memory

**Owner:** MiniMax after Task 1 review

**Files:**
- Create: `backend/src/memory/sessionStore.js`
- Create: `backend/test/session-memory.test.js`

**Interfaces:**
- Produces: `createSessionStore({ dataDir, fs?, now?, summarize? }) -> { get, update }`
- Session key is `(profileId, topicId)`
- `update` accepts only `canvasState`, `recentEvents`, `code`, `latestRunResult`, `traceEvents`, `chatMessages`, `chatSummary`, and `currentStep`

- [ ] **Step 1: Write failing memory tests**

Prove that memory starts empty, survives a new store instance, keeps at most 50 recent events, keeps at most 20 recent chat messages, caps code and summaries, rejects malformed IDs, and atomically preserves the last valid file when a write fails.

- [ ] **Step 2: Add trace safety tests**

Allow trace types matching `^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$`. Reject trace payload keys named `html`, `script`, `componentCode`, or `executableCode`. Cap each trace payload and retain at most 200 events.

- [ ] **Step 3: Run memory tests and verify failure**

Run: `node --test test/session-memory.test.js`

Expected: FAIL because the memory module does not exist.

- [ ] **Step 4: Implement bounded validated memory**

Store sessions under `<dataDir>/sessions/<profileId>/<topicId>.json`. Use a provided summarizer only when more than 20 chat messages exist; tests use a deterministic fake summarizer. Never call a provider directly from the store.

- [ ] **Step 5: Run focused tests**

Run: `node --test test/session-memory.test.js`

Expected: PASS for persistence, bounds, summarization handoff, trace validation, and atomic writes.

- [ ] **Step 6: Lead review checkpoint**

Return memory limits, persisted shape, tests run, and unresolved privacy risks. Do not edit graph, provider, artifact, route, or frontend files.

### Task 6: Foundation API integration and end-to-end verification

**Owner:** DeepSeek, followed by lead integration

**Files:**
- Modify: `backend/src/app.js`
- Modify: `backend/src/server.js`
- Modify: `backend/smoke-test.js`
- Create: `backend/test/foundation-api.test.js`

**Interfaces:**
- Consumes all reviewed services from Tasks 1 through 5
- Produces the foundation routes from the design specification
- Preserve existing `/artifacts/:id`, `/run`, `/ai/stream/*`, and `/progress/:studentId` behavior

- [ ] **Step 1: Write failing API integration tests**

Create the app with injected service fakes and verify:

```text
GET  /options
GET  /profiles
POST /profiles
GET  /profiles/:profileId
GET  /topics
GET  /topics/:topicId
GET  /artifact-runtime/:profileId/:topicId
POST /artifact-runtime/:profileId/:topicId/generate
GET  /sessions/:profileId/:topicId
POST /sessions/:profileId/:topicId
```

Assert status codes, stable error codes, body size enforcement, and absence of provider names or stack traces in errors.

- [ ] **Step 2: Run API tests and verify failure**

Run: `node --test test/foundation-api.test.js`

Expected: FAIL because routes are not registered.

- [ ] **Step 3: Add request logging and dependency injection to `createApp`**

Accept optional services in `createApp({ logger, profileStore, topicGraph, artifactGenerator, sessionStore })`. Build default services in one composition function for `server.js`. Emit `request.started` and `request.completed` with method, route, status, and duration.

- [ ] **Step 4: Implement thin route handlers**

Route handlers validate request shape, call one service method, and translate service codes to HTTP responses. Do not place graph, provider, validation, cache, or memory rules inside `app.js`.

- [ ] **Step 5: Extend the smoke test**

Start without profiles, create one Go/backend profile, list it, resolve Queue topics, verify uncached status, and exercise session read/write. Keep NVIDIA disabled in smoke tests. Capture server logs and assert they contain required startup and request events without secret values.

- [ ] **Step 6: Run backend verification**

Run: `npm test`

Expected: all focused tests and the smoke test pass.

- [ ] **Step 7: Run frontend regression build**

Run: `npm run build` from `frontend/`.

Expected: Vite production build succeeds. This task does not redesign the frontend.

- [ ] **Step 8: Inspect the final diff**

Run: `git diff --check` and review every changed file for duplicate validation, hidden provider failures, secret leakage, synchronous request-path I/O, hardcoded profiles, and Queue-only product assumptions.

- [ ] **Step 9: Independent GLM review**

Provide the design, plan, final diff, and test output. Require findings ordered by severity with file and line references. GLM remains read-only.

- [ ] **Step 10: Lead verification report**

Report files changed, working behavior, exact tests run, known caveats, and the next separate plan for Profile Builder and Game Field UI.
