# Refract — Build Handoff

## What you are building
A GitHub repository called **Refract** — an open source, fork-based learning system where Claude/GPT acts as a teacher, GitHub is the memory, and the curriculum teaches DSA + System Design + Game Theory + Backend through story-first, visual-first explanations. No platform. No SaaS. Just structured markdown files, prompt templates, and rules.

---

## Your job right now
Scaffold the full repository skeleton. No content yet. Just the folder structure, empty files with correct names, and placeholder comments inside each file explaining what it will contain. Do not fill in actual curriculum content. Do not improvise new folders or files not listed here.

---

## Exact folder structure to create

```text
refract/
├── README.md
├── RULES.md
├── CONTRIBUTING.md
├── profile.md
├── progress.md
├── onboarding/
│   └── setup.md
├── dsa/
│   └── _template.md
├── system-design/
│   └── _template.md
├── game-theory/
│   └── _template.md
├── backend/
│   └── go/
│       ├── http-servers.md
│       ├── databases.md
│       ├── auth.md
│       ├── apis.md
│       └── concurrency.md
├── languages/
│   └── go/
│       └── _template.md
└── prompts/
    └── session-start.md
```

---

## What each file should contain (placeholders only)

### README.md
- Project name: Refract
- One line: "One concept. Five lenses. Your own pace."
- What it is (2-3 sentences max)
- The five lenses: Go → DSA → Backend + SQL → System Design → Game Theory
- How to fork and start
- Link to RULES.md and CONTRIBUTING.md
- No fluff. No marketing speak.

### RULES.md
These are the hard rules every AI model must follow when teaching from this repo. Write them exactly as listed:
1. Max 150 words per concept explanation
2. Every explanation must include one visual (Mermaid or ASCII)
3. One analogy maximum per concept
4. One example shown by Claude, one example attempted by user
5. Every concept links to: 1 real interview problem (company documented), 3 LeetCode links (easy/medium/hard), 1 SD equivalent question
6. Never explain what you are about to explain — just explain it
7. No jargon without inline definition for beginner mode
8. Never ask the user more than one question at a time
9. Total response budget per session: 800 tokens maximum
10. Push all artifacts to GitHub before ending session
11. Cheating prevention: problems are always contextual to previous step — copy-pasting without understanding breaks the next step by design
12. Behavioral signals to log: response time, clarifying questions asked, hints requested

### CONTRIBUTING.md
- How to add a new language track (create folder under /languages and /backend)
- How to add a new concept file (must follow _template.md exactly)
- Rules for LeetCode links (must verify they exist and match the concept pattern)
- Rule: every new concept file must have all five lenses filled — no partial submissions

### profile.md
Placeholder with these fields:
```yaml
name:
mode: [beginner | intermediate | expert]
learning_style: [inferred by Claude during onboarding]
visual_preference: [high | medium | low]
language_track: go
started:
last_session:
```

### progress.md
Placeholder with this structure per entry:
```yaml
## [concept name]
date:
explained_via: [analogy used]
examples_given:
user_attempted: [yes/no]
time_to_solve:
struggled_with:
hints_requested:
artifacts_pushed:
interview_problem_attempted: [yes/no]
status: [complete | in-progress | skipped]
```

### onboarding/setup.md
Placeholder explaining the onboarding flow:
- Step 1: Ask user "Are you a beginner?" — if yes, skip all tests, go to basics
- Step 2: If intermediate/expert — run three tests (logic/DSA/SD trade-offs, no syntax)
- Step 3: Claude infers visual vs word preference from how user responds, does not ask directly
- Step 4: Write results to profile.md
- Step 5: Begin first concept

### dsa/_template.md, system-design/_template.md, game-theory/_template.md, languages/go/_template.md
All four templates follow this exact structure:
```markdown
# [Concept Name]

## The Story
[placeholder]

## Visual
[Mermaid or ASCII diagram placeholder]

## Go Implementation
[code placeholder]

## DSA Pattern
[placeholder]

## Backend + SQL Connection
[placeholder]

## System Design Angle
[placeholder]

## Game Theory Angle
[placeholder]

## Interview Problem
Company: [e.g. Google, Amazon]
Problem: [placeholder]
LeetCode: Easy — [link] | Medium — [link] | Hard — [link]
SD Equivalent: [link or description]

## User Practice Problem
[placeholder — must build on the explained example]
```

### backend/go/ files
Each file (http-servers, databases, auth, apis, concurrency) gets a placeholder header explaining what concepts it will cover. databases.md must include a note that SQL fundamentals are covered here.

### prompts/session-start.md
This is the master prompt Claude or GPT reads at the start of every session. Placeholder structure:

CONTEXT LOADING (runs silently, no output to user):
- Step 1: Fetch raw GitHub URL of profile.md from this forked repo
- Step 2: Fetch raw GitHub URL of progress.md from this forked repo
- Step 3: Identify last completed concept from progress.md
- Step 4: Identify next concept in queue based on folder order
- Step 5: Load RULES.md — all rules are non-negotiable for this session

TEACHING (begins immediately after context load):
- Step 6: Adapt teaching style to learning_style and visual_preference from profile.md
- Step 7: Begin teaching next concept — no greeting, no recap, no questions, just teach
- Step 8: After user completes practice problem, update progress.md entry and push artifacts

RULES FOR SESSION START:
- Never ask the user what they want to learn — you already know from progress.md
- Never ask for their level — it is in profile.md
- Never summarize what you are about to do — just do it
- If profile.md or progress.md cannot be fetched, ask user to paste the raw content — do not proceed blind

---

## Hard constraints for Codex
- Do not add any files not listed above
- Do not write actual curriculum content — placeholders only
- Do not change the folder names
- Every placeholder comment must explain what that section will contain in one sentence
- Keep README under 200 words
- No emojis anywhere except README if absolutely necessary
- All markdown must be clean and render correctly on GitHub
