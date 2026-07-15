import {
  getV1VisualKinds,
  getV2Modes,
  getV2PrimitiveKinds,
  getV2SemanticEvents,
  getV2AnimationPresets,
  getV2LabKinds,
  getV2EvaluationKinds,
  getV2CheckpointKinds,
  getV2ExperimentKinds,
  getV2CompletionRuleKinds,
  getV2PrimitiveStatuses,
  getV2PrimitiveSpecVersions
} from "./capabilities.js";

const MAX_SOURCE_CHARS = 24000;
const MAX_SERIALIZED_CHARS = 96000;

// ponytail: v1 visual kinds derived from the shared capability manifest;
// the Set is frozen but join demands an array. Pre-compute once at module
// load so every caller shares the same resolved string.
const V1_VISUAL_KINDS = Array.from(getV1VisualKinds());

function validateStrings(input) {
  if (!input || typeof input.profile !== "object") {
    throw new Error("profile is required");
  }
  if (!input.topicContext || typeof input.topicContext !== "object") {
    throw new Error("topicContext is required");
  }
  if (!input.topicContext.primary || typeof input.topicContext.primary !== "object") {
    throw new Error("topicContext.primary is required");
  }
}

function truncateSource(text) {
  if (typeof text !== "string") return "";
  if (text.length <= MAX_SOURCE_CHARS) return text;
  return text.slice(0, MAX_SOURCE_CHARS) + "\n\n[truncated]";
}

function buildSystemMessage() {
  const kinds = V1_VISUAL_KINDS.join(", ");
  return `You are a curriculum artifact generator. Respond with exactly one valid JSON object and nothing else.

The JSON object must conform to this contract:

{
  "schemaVersion": 1,
  "artifactVersion": 1,
  "profileId": "<exact profile ID from context>",
  "topicId": "<exact requested topic ID>",
  "title": "<descriptive title>",
  "summary": "<one-paragraph summary>",
  "connections": {
    "core": ["<core-topic-id>"],
    "paired": ["<paired-topic-id>"]
  },
  "story": {
    "premise": "<game-theory scenario setup>",
    "objective": "<learner goal>",
    "decisions": [{"label": "<choice>", "outcome": "<result>"}],
    "audioScript": "<narration script>"
  },
  "visual": {
    "kind": "<must be one of: ${kinds}>",
    "initialState": {<topic-specific state>},
    "controls": [{"action": "<name>", "label": "<display>"}]
  },
  "examples": [{"description": "<text>", "data": {<example-specific>}}],
  "practice": {
    "language": "<exact profile language>",
    "prompt": "<task description>",
    "starterCode": "<starter function or skeleton>",
    "tests": "<test cases>",
    "supportedTraceEvents": ["<domain>.enqueue", "<domain>.dequeue"]
  },
  "chat": {
    "suggestedQuestions": ["<artifact-aware question>"]
  },
  "next": ["<connected topic IDs>"]
}

Safety rules:
- Output only valid JSON. No markdown fences, no commentary, no code blocks.
- Do not include html, jsx, componentCode, executableCode, or any executable frontend code.
- The visual kind must be one of the allowed kinds listed above.
- Match profileId and topicId exactly as provided in the source context.
- Do not invent topic IDs, domains, or source paths not present in the context.`;
}

function formatProfileSection(profile, primary) {
  const { id, name, level, language, pairedDomains, goal } = profile;
  const parts = [
    `## Learner Profile`,
    `- **ID**: ${id}`,
    `- **Name**: ${name}`,
    `- **Level**: ${level}`,
    `- **Language**: ${language}`,
    `- **Paired Domains**: ${(pairedDomains || []).join(", ")}`,
    `- **Goal**: ${goal || ""}`,
    ``,
    `Exact profileId: ${id}`,
    `Exact topicId: ${primary.id}`,
    `Exact practice language: ${language}`,
    `Allowed visual kinds for this topic: ${(primary.allowedVisualKinds || []).join(", ")}`,
    `Generate an artifact using these exact constraints.`,
    `Include game-theory storytelling that connects the technical concepts.`
  ];
  return parts.join("\n");
}

function formatTopicSection(label, nodes) {
  if (!nodes || nodes.length === 0) return "";
  const parts = [`## ${label}`];
  for (const node of nodes) {
    const nodeLabel = node.title || "unknown";
    parts.push(`### ${node.id}: ${nodeLabel}`);
    if (node.sourceText) {
      parts.push(truncateSource(node.sourceText));
    }
    parts.push("");
  }
  return parts.join("\n");
}

function formatAdjacentSection(nodes) {
  if (!nodes || nodes.length === 0) return "";
  const parts = [`## Adjacent Topics`];
  for (const node of nodes) {
    parts.push(`- ${node.id}: ${node.title || ""}`);
  }
  parts.push("");
  return parts.join("\n");
}

function buildUserMessage(profile, topicContext) {
  const sections = [];

  sections.push(formatProfileSection(profile, topicContext.primary));
  sections.push(`## Primary Topic: ${topicContext.primary.id}`);
  sections.push(truncateSource(topicContext.primary.sourceText));
  sections.push("");

  sections.push(formatTopicSection("Core Domain Sources", topicContext.core));
  sections.push(formatTopicSection("Paired Domain Sources", topicContext.paired));
  sections.push(formatAdjacentSection(topicContext.adjacent));

  sections.push("Generate a complete artifact JSON object following the system contract.");
  return sections.join("\n");
}

function ensureSizeLimit(messages) {
  let serialized = JSON.stringify(messages);
  if (Buffer.byteLength(serialized, "utf8") <= MAX_SERIALIZED_CHARS) return messages;

  let trimmed = JSON.parse(serialized);
  for (const msg of trimmed) {
    if (msg.role !== "user") continue;
    let content = msg.content;
    let currentSerialized = JSON.stringify(trimmed);
    let currentBytes = Buffer.byteLength(currentSerialized, "utf8");

    while (currentBytes > MAX_SERIALIZED_CHARS && content.length > 1000) {
      const excess = currentBytes - MAX_SERIALIZED_CHARS;
      const trimAmount = Math.min(excess + 512, content.length - 1000);
      content = content.slice(0, content.length - trimAmount);
      if (!content.endsWith("[truncated]")) {
        content = content + "\n\n[truncated]";
      }
      trimmed[trimmed.findIndex((m) => m.role === "user")].content = content;
      currentSerialized = JSON.stringify(trimmed);
      currentBytes = Buffer.byteLength(currentSerialized, "utf8");
    }
  }

  return trimmed;
}

export function buildArtifactMessages({ profile, topicContext }) {
  validateStrings({ profile, topicContext });

  const systemMessage = {
    role: "system",
    content: buildSystemMessage()
  };

  const userMessage = {
    role: "user",
    content: buildUserMessage(profile, topicContext)
  };

  const messages = [systemMessage, userMessage];
  return { messages: ensureSizeLimit(messages) };
}

// ===========================================================================
// V2 prompt contract. See docs/superpowers/specs/2026-07-12-cinematic-visual-
// artifacts-design.md and shared/artifact-capabilities.json. The capability
// subset is projected from the shared manifest (capabilities.js); this module
// never re-declares allowed primitives, events, animation presets, lab kinds,
// checkpoint kinds, experiment kinds, completion rule kinds, or statuses. The
// trusted application owns reducers, layout, animations, controls, execution,
// and validation. Generated data remains non-executable.
// ===========================================================================

function list(values) {
  return Array.from(values).join(", ");
}

function v2CapabilitySubset() {
  return {
    modes: list(getV2Modes()),
    primitives: list(getV2PrimitiveKinds()),
    primitiveSpecVersions: list(getV2PrimitiveSpecVersions()),
    statuses: list(getV2PrimitiveStatuses()),
    events: list(getV2SemanticEvents()),
    animations: list(getV2AnimationPresets()),
    labs: list(getV2LabKinds()),
    evaluations: list(getV2EvaluationKinds()),
    checkpoints: list(getV2CheckpointKinds()),
    experiments: list(getV2ExperimentKinds()),
    completionRules: list(getV2CompletionRuleKinds())
  };
}

function buildV2SystemMessage(caps) {
  return `You are a cinematic curriculum artifact generator for the Refract v2 contract. Respond with exactly one valid JSON object and nothing else.

The trusted application owns reducers, layout, animations, controls, accessibility, execution, and validation. You author only bounded instructional data. The visual is the primary first surface. Generate visual teaching sequences and concise synchronized snippets. Do not generate long prose.

The JSON object must conform to the v2 contract envelope:

{
  "schemaVersion": 2,
  "artifactVersion": 1,
  "profileId": "<exact profile ID from context>",
  "topicId": "<exact requested topic ID>",
  "title": "<at most 200 characters>",
  "learningObjectives": ["<at least 1, at most 16 short objectives>"],
  "experience": {
    "mode": "guided-lab",
    "primitive": {
      "kind": "worker-queue",
      "specVersion": 1,
      "initialState": {
        "producer": { "id": "<id>", "status": "<one of: ready, idle, busy, blocked>" },
        "channel": { "id": "<id>", "capacity": <non-negative integer>, "items": [] },
        "workers": [{ "id": "<id>", "status": "idle" }]
      }
    },
    "snippets": [
      {
        "id": "<lowercase kebab id>",
        "language": "<exact profile language>",
        "file": "<allowed source file path>",
        "code": "<at most 16384 characters>",
        "editable": false,
        "annotations": [{ "line": <positive integer within code lines>, "text": "<at most 280 characters>" }]
      }
    ],
    "chapters": [
      {
        "id": "<lowercase kebab id>",
        "title": "<title>",
        "scenes": [
          {
            "id": "<lowercase kebab id>",
            "title": "<title>",
            "steps": [
              {
                "id": "<lowercase kebab id>",
                "event": {
                  "type": "<one of the supported semantic events>",
                  "target": "<role-appropriate entity id from initialState>",
                  "payload": { "item": { "id": "<id>", "label": "<short label>" } }
                },
                "focus": ["<declared entity id>"],
                "snippet": { "id": "<declared snippet id>", "lines": [<positive integer within code lines>] },
                "caption": "<at most 280 characters>",
                "narration": "<at most 1200 characters>",
                "animationPreset": "<one of the supported animation presets>",
                "checkpoint": {
                  "kind": "prediction",
                  "question": "<question>",
                  "options": [{ "id": "<id>", "label": "<at most 160 characters>" }],
                  "answer": "<one of the option ids>",
                  "explanation": "<short explanation>"
                }
              }
            ]
          }
        ]
      }
    ],
    "experiments": [
      { "id": "<worker-count or channel-capacity>", "kind": "bounded-number", "min": <number>, "max": <number>, "step": <positive number>, "default": <number between min and max on step> }
    ],
    "completionRules": [
      { "kind": "required-scenes", "sceneIds": ["<declared scene id>"] },
      { "kind": "required-checkpoints", "stepIds": ["<declared step id with a checkpoint>"] }
    ]
  },
  "lab": {
    "kind": "code",
    "language": "<exact profile language>",
    "title": "<at most 200 characters>",
    "files": [{ "path": "<allowed source file path>", "starterCode": "<at most 65536 characters>" }],
    "evaluation": { "kind": "go-tests", "testSetId": "<lowercase kebab id>" },
    "trace": {
      "supportedEvents": ["<supported semantic events>"],
      "sourceMapRequired": true
    }
  },
  "chat": {
    "suggestedQuestions": ["<at most 12 artifact-aware questions, at most 240 characters each>"]
  },
  "next": ["<connected topic IDs, at most 64>"]
}

Capability manifest subset (advertised only; do not invent primitives, events, animation presets, lab kinds, checkpoint kinds, experiment kinds, or completion rule kinds outside this list):
- Experience modes: ${caps.modes}
- Primitive kinds: ${caps.primitives}
- Primitive spec versions: ${caps.primitiveSpecVersions}
- Primitive statuses: ${caps.statuses}
- Semantic event types: ${caps.events}
- Animation presets: ${caps.animations}
- Lab kinds: ${caps.labs}
- Evaluation kinds: ${caps.evaluations}
- Checkpoint kinds: ${caps.checkpoints}
- Experiment kinds: ${caps.experiments}
- Completion rule kinds: ${caps.completionRules}

Visual-first rules:
- The first surface the learner sees must be the visual. Explanations follow and stay synchronized with the current scene.
- Each step changes the visual state and binds a snippet line to that change. Captions and narration are concise; narration must not exceed 1200 characters and captions must not exceed 280 characters.
- Snippets are read-only source (editable: false) and must be bound to a scene and a code line. A snippet shown without a scene/line binding is invalid.
- Every chapter must include a learner prediction checkpoint or an experiment that affects visible state.
- Reduce explanations to short captions and narration that reference the active scene. Do not write long prose articles.
- Channels, workers, items, and producers referenced by steps must be declared in primitive.initialState or produced by earlier steps.
- Focus arrays must reference declared entity ids only.
- Completion rules must reference declared scene ids or steps that carry a checkpoint.
- Provide a textual state description cue for accessibility: narration must describe the visible state change, not only the concept.

Bounds:
- Snippets: 1 to 32 per artifact. Code per snippet at most 16384 characters. Annotation text at most 280 characters, at most 64 annotations per snippet.
- Chapters: 1 to 32. Scenes per chapter: 1 to 32. Steps per scene: 1 to 200.
- Focus entries: 1 to 16 per step. Options per checkpoint: 1 to 6.
- Experiments: 0 to 8. Experiment magnitude at most 1000000.
- Lab files: 1 to 16. Lab starterCode per file at most 65536 characters. Lab trace events: 1 to 32.
- Suggested questions: 0 to 12, each at most 240 characters.
- next: at most 64 topic references.

Safety rules:
- Output only valid JSON. No markdown fences, no commentary, no code blocks.
- Do not include html, jsx, componentCode, executableCode, or any executable frontend code. Field names are case-insensitive: html, jsx, componentcode, executablecode are forbidden anywhere in the object.
- Do not include CSS, React component code, animation scripts, package names, or arbitrary executable UI.
- Use only the primitive kinds, semantic events, animation presets, lab kinds, evaluation kinds, checkpoint kinds, experiment kinds, and completion rule kinds listed in the capability manifest subset above.
- Match profileId, topicId, and language exactly as provided in the context.
- Do not invent topic ids, domains, source paths, or capabilities not present in the context or the manifest subset.
- Lab files must use only allowed source file extensions: .go, .py, .js, .ts, .java, .cpp, .rs, .md, .sql, .yml, .yaml, .json, .sh, .txt.
- The lab language must match the exact profile language.`;
}

function buildV2UserMessage(profile, topicContext, caps) {
  const { primary } = topicContext;
  const sections = [];

  sections.push(`## Learner Profile`);
  sections.push(`- **ID**: ${profile.id}`);
  sections.push(`- **Name**: ${profile.name}`);
  sections.push(`- **Level**: ${profile.level}`);
  sections.push(`- **Language**: ${profile.language}`);
  sections.push(`- **Paired Domains**: ${(profile.pairedDomains || []).join(", ")}`);
  sections.push(`- **Goal**: ${profile.goal || ""}`);
  sections.push("");

  sections.push(`Exact profileId: ${profile.id}`);
  sections.push(`Exact topicId: ${primary.id}`);
  sections.push(`Exact language: ${profile.language}`);
  sections.push(`Primitive kind for this topic: ${topicContext.primitiveKind || caps.primitives}`);
  sections.push("");

  sections.push(`Capability manifest subset (advertised only; do not invent capabilities outside this list):`);
  sections.push(`- Experience modes: ${caps.modes}`);
  sections.push(`- Primitive kinds: ${caps.primitives}`);
  sections.push(`- Primitive spec versions: ${caps.primitiveSpecVersions}`);
  sections.push(`- Primitive statuses: ${caps.statuses}`);
  sections.push(`- Semantic event types: ${caps.events}`);
  sections.push(`- Animation presets: ${caps.animations}`);
  sections.push(`- Lab kinds: ${caps.labs}`);
  sections.push(`- Evaluation kinds: ${caps.evaluations}`);
  sections.push(`- Checkpoint kinds: ${caps.checkpoints}`);
  sections.push(`- Experiment kinds: ${caps.experiments}`);
  sections.push(`- Completion rule kinds: ${caps.completionRules}`);
  sections.push("");

  sections.push(`## Primary Topic: ${primary.id}`);
  sections.push(truncateSource(primary.sourceText));
  sections.push("");

  if (Array.isArray(topicContext.core) && topicContext.core.length) {
    sections.push(formatTopicSection("Core Domain Sources", topicContext.core));
  }
  if (Array.isArray(topicContext.paired) && topicContext.paired.length) {
    sections.push(formatTopicSection("Paired Domain Sources", topicContext.paired));
  }
  if (Array.isArray(topicContext.adjacent) && topicContext.adjacent.length) {
    sections.push(formatAdjacentSection(topicContext.adjacent));
  }

  sections.push("Generate a complete v2 artifact JSON object following the system contract and visual-first rules.");
  return sections.join("\n");
}

export function buildArtifactMessagesV2({ profile, topicContext }) {
  validateStrings({ profile, topicContext });

  const caps = v2CapabilitySubset();
  const systemMessage = { role: "system", content: buildV2SystemMessage(caps) };
  const userMessage = { role: "user", content: buildV2UserMessage(profile, topicContext, caps) };
  const messages = [systemMessage, userMessage];
  return { messages: ensureSizeLimit(messages) };
}

// Repair prompt for v2 validation failures. Retains exact IDs, language, the
// capability manifest subset, and stable validation error codes. Never embeds
// source Markdown, the invalid response body, secrets, or local paths. The
// stable error code format mirrors artifactSchema.js (code: path (message)).
export function buildRepairMessagesV2(originalSystemMessage, errors, validationContext) {
  const caps = v2CapabilitySubset();
  const details = errors.map((err) => `- ${err.code}: ${err.path} (${err.message})`).join("\n");

  const repairSystem = originalSystemMessage
    ? { role: "system", content: originalSystemMessage }
    : { role: "system", content: buildV2SystemMessage(caps) };

  const constraints = [
    `The previous artifact failed v2 validation with these stable errors:`,
    details,
    ``,
    `Exact profileId: ${validationContext.profileId}`,
    `Exact topicId: ${validationContext.topicId}`,
    `Exact language: ${validationContext.language}`,
    `Primitive kind: ${validationContext.primitiveKind || caps.primitives}`,
    ``,
    `Capability manifest subset (advertised only):`,
    `- Experience modes: ${caps.modes}`,
    `- Primitive kinds: ${caps.primitives}`,
    `- Primitive spec versions: ${caps.primitiveSpecVersions}`,
    `- Primitive statuses: ${caps.statuses}`,
    `- Semantic event types: ${caps.events}`,
    `- Animation presets: ${caps.animations}`,
    `- Lab kinds: ${caps.labs}`,
    `- Evaluation kinds: ${caps.evaluations}`,
    `- Checkpoint kinds: ${caps.checkpoints}`,
    `- Experiment kinds: ${caps.experiments}`,
    `- Completion rule kinds: ${caps.completionRules}`,
    ``,
    `Regenerate the complete v2 artifact JSON object so it passes every listed error and the exact constraints above. Return only a valid JSON object. Do not include the previous response, source Markdown, secrets, local paths, or executable frontend code (html, jsx, componentCode, executableCode).`
  ].join("\n");

  return [repairSystem, { role: "user", content: constraints }];
}
