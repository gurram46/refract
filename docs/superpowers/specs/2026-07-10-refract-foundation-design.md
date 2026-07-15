# Build Refract's profile-driven artifact foundation

This design defines the first implementation milestone for Refract. It replaces the hardcoded Queue prototype and the two fixed learner archetypes with a user-created profile, a connected topic graph, and a validated artifact generation pipeline.

## Plan

- **Content type**: Conceptual design specification
- **Goal**: Define contracts that coding agents can implement and verify without reinterpreting the product
- **Audience**: Refract maintainers and coding agents
- **Content plan**: Product model, architecture, data contracts, generation flow, logs, errors, tests, and implementation boundaries
- **Open questions**: None for this milestone

## Product model

Refract is a local-first interactive learning workbench. It combines permanent technical foundations with tracks selected by each learner.

Every learning path includes these core domains:

- Data structures and algorithms (DSA)
- System design
- Game theory

Each learner pairs the core with one or more selected domains:

- Programming language
- Backend
- Frontend
- Machine learning (ML)
- Artificial intelligence (AI)
- Data science

Game theory supplies the scenario, decisions, constraints, incentives, and consequences that connect the technical topics. The generated artifact turns this combined context into an interactive story rather than an isolated lesson.

## User-created profiles

The product must not require hardcoded Sandeep or Sister profiles. A learner creates a profile through product selections, and Refract stores it locally.

A profile records:

```json
{
  "id": "local-profile-id",
  "name": "Learner name",
  "level": "beginner",
  "language": "go",
  "pairedDomains": ["backend"],
  "selectedTopics": ["dsa.queue"],
  "goal": "Build reliable backend systems"
}
```

The permanent core domains do not need profile toggles. Refract always connects selected topics to DSA, system design, and game theory where matching source material exists.

Sample profiles may exist under an examples directory. They must not appear as required defaults or constrain profile creation.

## Knowledge source

Human-authored Markdown files remain the source material. Existing content under `dsa/`, `system-design/`, `game-theory/`, `backend/`, and `languages/` stays available during the migration.

The content library expands with these directories when source material exists:

```text
frontend/
ml/
ai/
data-science/
```

Markdown files contain teaching facts, examples, constraints, and topic-specific guidance. They are not user profiles and are not final artifacts.

## Topic graph

A versioned graph manifest connects topics across domains. Each node identifies its Markdown source, domain, supported visual kinds, and relationships.

```json
{
  "schemaVersion": 1,
  "nodes": [
    {
      "id": "dsa.queue",
      "domain": "dsa",
      "source": "dsa/queues.md",
      "allowedVisualKinds": ["queue"],
      "connections": [
        "system-design.retry-queue",
        "game-theory.queue-fairness",
        "backend.go.worker-queue"
      ]
    }
  ]
}
```

The backend validates graph paths before reading files. Graph entries cannot escape the repository root. Missing optional connections do not prevent the primary topic from loading, but the logs identify each missing source.

## Generated artifact

An artifact is validated JSON data rendered by trusted frontend primitives. The model must not return executable React, JavaScript, or HTML.

The artifact contract includes:

- Requested profile and topic identifiers
- Core and selected-domain connections
- Interactive game-theory story
- Structured visual state and controls
- Explanations and worked examples
- Practice tasks and tests where relevant
- Artifact-aware chat context
- References and next graph nodes

The first supported visual primitive remains `queue`. The contract can name future primitives, but validation rejects unsupported or disallowed kinds.

## Context and local memory

Refract builds bounded context for generation and artifact chat. It does not send every Markdown file or an unlimited conversation to the provider.

Generation context contains:

- The validated local profile
- The selected game-field node
- The permanent DSA, system-design, and game-theory sources connected to that node
- Sources from the learner's selected language and paired domains
- Summaries of adjacent graph nodes
- The artifact schema and allowed visual kinds

Artifact-chat context contains:

- The validated cached artifact
- Current canvas state and recent interaction events
- Current code and latest test result
- Current game-field progress
- The latest 20 chat messages
- A compact summary of older messages

Local memory uses these paths:

```text
backend/data/profiles/<profileId>.json
backend/data/progress/<profileId>.json
backend/data/sessions/<profileId>/<topicId>.json
generated/artifacts/<profileId>/<topicId>/artifact.json
```

Session memory records recent visual actions, latest code, latest test result, chat summary, recent messages, and the current artifact step. Writes are atomic and size-bounded. Memory never stores API keys, authorization headers, hidden provider prompts, or unbounded provider responses.

The backend summarizes old chat before dropping it from active context. The learner can resume an artifact after restarting the application without regenerating the artifact.

## Code-driven visual trace

Code execution remains backend-owned. The runner emits validated trace events that fixed frontend primitives replay.

For a Queue artifact, supported trace events include:

```text
queue.enqueue
queue.dequeue
queue.peek
queue.empty
```

The frontend derives animations from actual trace events, not model guesses. The artifact chat receives the latest trace summary so it can explain the exact step where code and expected behavior diverged.

The later Artifact Canvas plan must include play, pause, step, replay, and reset controls. This foundation milestone preserves and tests the structured trace contract but does not implement the final visual replay interface.

## Backend components

The foundation separates responsibilities into focused modules:

- **Environment loader**: loads backend environment values and reports whether required keys exist without logging values
- **Logger**: emits structured events for startup, requests, providers, validation, and cache activity
- **Profile store**: validates and persists user-created local profiles
- **Topic graph loader**: validates the graph manifest and resolves connected Markdown sources
- **Prompt builder**: combines profile selections, core sources, paired-domain sources, and the artifact output contract
- **AI provider**: calls NVIDIA's OpenAI-compatible endpoint and normalizes provider responses
- **Artifact validator**: verifies schema, identifiers, visual kinds, practice language, and forbidden executable fields
- **Artifact cache**: reads and writes validated artifacts under `generated/`
- **Artifact generator**: coordinates prompt construction, provider fallback, validation retry, and cache writes

Each module exposes a narrow interface so backend behavior can be tested without starting the frontend.

## Provider chain

The backend uses the NVIDIA application programming interface (API). Provider secrets remain backend-only.

The model order is fixed for this milestone:

```text
primary: minimaxai/minimax-m3
fallback: deepseek-ai/deepseek-v4-pro
```

Every provider request includes an explicit `max_tokens` value. The provider module treats missing choices, missing message content, blank content, non-success status codes, malformed JSON, and timeouts as distinct failures.

The fallback runs when the primary request fails or returns unusable content. Schema validation failure triggers one repair attempt with validation details. The backend never caches an invalid response.

## Cache behavior

The backend stores validated artifacts at:

```text
generated/artifacts/<profileId>/<topicId>/artifact.json
```

Reading an artifact never triggers generation. Generation requires an explicit request. A normal generation request returns the valid cache entry when it exists; a developer-only regeneration path may replace it later.

Cache writes use a temporary file followed by an atomic rename. Validation runs again when the backend reads a cached artifact.

## Foundation API

The first milestone exposes these routes:

```text
GET    /health
GET    /options
GET    /profiles
POST   /profiles
GET    /profiles/:profileId
GET    /topics
GET    /topics/:topicId
GET    /artifact-runtime/:profileId/:topicId
POST   /artifact-runtime/:profileId/:topicId/generate
```

`GET /options` returns allowed levels, languages, and paired domains. It does not return model names, provider URLs, or secret status intended only for developers.

`GET /artifact-runtime/:profileId/:topicId` returns a validated cached artifact or a clean `not_generated` response. `POST /artifact-runtime/:profileId/:topicId/generate` returns a cached artifact when available or starts the explicit generation flow.

## Structured logs

Logs use stable event names and never contain API keys or authorization headers.

Required events include:

- `env.loaded`
- `provider.configured`
- `server.started`
- `request.started`
- `request.completed`
- `profile.read`
- `profile.written`
- `topic_graph.loaded`
- `generation.started`
- `provider.request.started`
- `provider.response.received`
- `provider.response.empty`
- `provider.request.failed`
- `provider.fallback.started`
- `artifact.validation.succeeded`
- `artifact.validation.failed`
- `cache.read.hit`
- `cache.read.miss`
- `cache.write.succeeded`
- `cache.write.failed`
- `generation.completed`
- `generation.failed`

Provider logs include the model name, duration, response status, and content presence. They exclude prompts when prompts may contain learner data.

## Error behavior

Backend logs retain technical details. API responses use stable codes and safe messages.

The frontend can translate these states into beginner-facing copy:

- Profile needs correction
- Topic source is unavailable
- Artifact has not been generated
- Artifact generation is in progress
- Artifact generation failed
- Cached artifact is ready

Provider names, API keys, base URLs, raw schema paths, and stack traces do not appear in beginner-facing responses.

## Code quality and engineering standards

The implementation must favor readable, reusable, testable code over fast patching. Optimization must remove measured or structurally unavoidable waste without introducing speculative abstractions.

Required code standards include:

- Use descriptive names that reflect product concepts such as profiles, topic connections, artifacts, and cache entries
- Keep each module responsible for one capability and expose a narrow public interface
- Centralize profile, graph, and artifact validation instead of duplicating checks in routes and storage modules
- Inject provider, filesystem, clock, and logger dependencies where tests need deterministic behavior
- Keep request handlers thin by moving business rules into service modules
- Return stable error codes from services and translate them into HTTP responses in one place
- Reuse shared constants for domains, model defaults, schema versions, limits, and supported visual kinds
- Prefer small functions with explicit inputs and outputs over hidden mutable state
- Add comments only where a constraint or decision is not clear from the code
- Remove dead code and obsolete Queue-only branches when their replacement is verified
- Avoid compatibility layers unless persisted data or an external consumer requires them
- Avoid a generic framework or abstraction until at least two concrete consumers require it

Performance and resource standards include:

- Never call a provider during a valid cache read
- Read and validate the topic graph once per backend process unless an explicit development reload occurs
- Load only the Markdown sources required by the selected graph path
- Use asynchronous filesystem and network operations on request paths
- Bound request bodies, provider timeouts, provider output tokens, and stored artifact sizes
- Perform cache writes atomically to prevent partial JSON files
- Avoid sending raw Markdown sources, prompts, stack traces, or logs to the frontend
- Record request and provider durations so later optimization uses evidence

Maintainability gates include:

- Every new service has focused unit tests for successful and failed behavior
- API routes have integration coverage for status codes and safe response shapes
- Tests use fake provider responses and temporary directories, not the real NVIDIA API or repository data
- Formatting and naming remain consistent with the existing ES module codebase
- A reviewer can understand a module's responsibility without reading its implementation dependencies
- No file combines environment loading, provider calls, validation, caching, and HTTP routing
- All changed behavior appears in the implementation report with exact verification commands

Code is complete only when tests cover the contract, errors remain safe, and another maintainer can modify one module without understanding the entire backend.

## Agent workflow

The lead agent owns architecture, integration, diff review, and final verification. Specialist agents receive bounded assignments and must follow this specification.

Every agent prompt includes:

- This specification's path and the product decisions it supersedes
- The exact user intent: permanent DSA, system design, and game theory paired with user-selected domains
- The required runtime provider order and the distinction between coding agents and application models
- Relevant existing files and tests
- Explicit file ownership and files the agent must not edit
- Acceptance criteria and verification commands
- Security constraints for secrets, generated data, filesystem paths, and code execution
- A required summary of files changed, decisions made, tests run, and unresolved risks

The work is divided into non-overlapping stages:

1. MiniMax owns profile contracts, profile persistence, the topic-graph manifest, graph loading, path safety, and focused tests
2. DeepSeek owns environment loading, structured logging, NVIDIA provider normalization, MiniMax-to-DeepSeek fallback, token limits, and focused tests
3. The lead agent reviews both independent changes and resolves contract mismatches before generation integration starts
4. DeepSeek owns artifact validation, cache behavior, prompt construction, generation coordination, API integration, and integration tests after the first two contracts are stable
5. MiniMax reviews generated artifact fixtures against the selected-domain and game-theory requirements without editing DeepSeek-owned modules
6. GLM performs a read-only adversarial review for product drift, security flaws, unnecessary coupling, performance waste, and missing tests
7. The lead agent evaluates every finding, applies or delegates verified fixes, and runs the complete test and build suite

Agents may research independent areas in parallel. Agents must not edit overlapping files concurrently.

The lead agent rejects work that compiles but violates the product model, hides failures, duplicates contracts, leaks provider details, skips tests, or recreates hardcoded learner profiles.

## Verification

Automated tests must prove:

- The app starts without pre-existing profiles
- Profile validation accepts supported selections and rejects invalid values
- Core domains remain permanent regardless of paired-domain selections
- Topic graph paths cannot escape the repository
- MiniMax M3 is primary
- DeepSeek V4 Pro runs after a primary failure
- Every provider request includes `max_tokens`
- Empty provider content triggers fallback
- Invalid artifacts never enter the cache
- Valid artifacts survive cache write and read validation
- Cache reads do not call the provider
- Logs never contain the configured API key
- Existing health behavior remains available
- Session memory retains bounded recent chat and summarizes older context
- Session memory persists the latest canvas, code, test, and trace state
- Trace events remain structured data and cannot request executable frontend code

Required repository checks are:

```bash
cd backend && npm test
cd frontend && npm run build
```

Focused backend tests may use injected provider and filesystem dependencies. They must not call NVIDIA during the normal test suite.

## Out of scope

This foundation milestone does not build the final profile-builder interface, game-field interface, artifact canvas, or tutor chat. It establishes the contracts those features consume.

The milestone also excludes:

- Hardcoded learner archetypes as product defaults
- Frontend provider calls
- Frontend API-key settings
- Automatic generation during page load
- Arbitrary model-generated rendering code
- Login, billing, hosted administration, and multi-tenant storage
- Broad UI polishing of the failed Queue prototype

## Completion criteria

The milestone is complete when the backend can create a local profile, resolve a selected topic and its core connections, generate through the required provider chain, validate the result, cache it, persist bounded session memory, and return it through the runtime API with safe errors and complete logs.
