# Refract Engineering Standards

These standards apply to the active Refract product path.

## Product boundary

Refract is local-first and artifact-first.

Active product directories:

```text
profiles/      learner archetype prompts
topics/        topic prompt files and lens connections
references/    curated reference links
generated/     ignored generated artifact/audio cache
packs/         seed artifact data during transition
backend/       local API, generation, validation, runner, provider routing
frontend/      artifact workbench UI and fixed visual primitives
docs/          specs and engineering contracts
```

Removed/deprecated path:

```text
canvas/        deleted from active product path
```

Do not rebuild inside `canvas/`. If old canvas ideas are useful, recover them from git history and port only the specific primitive or pattern into `frontend/`/`backend/` with tests.

## Core architecture rule

Generated artifacts are data, not trusted rendering code.

The model may generate:

- story/explanation markdown,
- audio narration script,
- lens summaries,
- structured visual specs,
- practice starter code and tests,
- references and next-topic links.

The model must not generate arbitrary executable HTML/JS for normal artifacts.

The frontend owns fixed visual primitives such as:

```text
queue
stack
hashmap
graph
timeline
pipeline
vector-space
matrix
```

A topic may only request visual kinds listed in its own `allowedVisualKinds` frontmatter.

## Local-first rule

The app must run from a clone without hosted infrastructure.

Do not add these unless explicitly re-scoped:

- multi-tenant auth,
- teacher/admin dashboards,
- billing,
- hosted classroom management,
- public account system.

## Prompt-authored artifact pipeline

The source of learning content is Markdown prompt files plus profile files.

Expected future flow:

```text
profile + topic
→ backend loads profile/topic/reference prompts
→ backend applies strict JSON output contract
→ provider returns generated artifact JSON
→ backend validates schema and visual kind
→ backend caches under generated/
→ frontend renders with fixed primitives
```

No page load may silently regenerate a cached artifact. Regeneration is a deliberate admin/developer action.

## Validation rule

Never show broken generated artifacts to beginner users.

Validation must check:

- valid JSON,
- required fields,
- profile/topic match,
- `schemaVersion === 1`,
- visual kind is allowed by the topic,
- no raw executable HTML/JS fields,
- practice language allowed for the profile/topic,
- references are treated as untrusted strings.

If validation fails, retry once with error context. If it still fails, return a clean text/static fallback instead of crashing or showing provider jargon.

## Backend standards

- Keep provider secrets backend-only.
- Never expose or log API keys.
- Keep request body limits.
- Keep runner timeouts.
- Keep stdout/stderr caps.
- Keep temp workspace cleanup.
- Store progress/cache as local files for now; no external DB.

## Frontend standards

- Beginner mode shows no provider setup, BYOK, or model jargon by default.
- Artifact workspace is the main event; tutor is secondary.
- Use accessible tabs and controls.
- Keep components small and owned by one purpose.
- Do not add large UI frameworks without review.
- Fixed visual primitives must be deterministic and testable.

## Quality bar

Every meaningful concept should eventually provide:

- visual explanation,
- interactive explore state,
- audio script,
- hands-on practice,
- test feedback,
- review/rubric,
- references,
- connected lenses across DSA/backend/system design/game theory/language/ML where relevant.

Weak artifacts are not acceptable:

- wall-of-text only,
- generic static diagram when an interactive primitive exists,
- missing audio script,
- missing practice path,
- broken JSON,
- raw model-written JS,
- unverified/hallucinated links.

## Verification

Before claiming done, run the relevant commands:

```bash
cd backend && npm test
cd frontend && npm run build
```

For spec/docs-only changes, verify the exact changed behavior where possible, such as `git check-ignore -v` for ignore-rule updates.
