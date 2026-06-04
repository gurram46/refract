# Code Quality Tracker

## Rubric — Claude scores every practice problem attempt

| Dimension | What Claude checks |
|---|---|
| Naming | Variables named clearly, not a/b/x/y |
| Structure | Logic in functions, not one giant block |
| Edge cases | Handles nil, empty input, overflow |
| Idiomatic | Go patterns used correctly, not Python-in-Go |
| Problem fit | Right data structure chosen for the problem |

Score: 1-5 per session. 1 = needs work. 5 = production ready.

---

## History

<!-- Claude appends one entry here after every session -->

### Session template
```
session: [number]
date: [date]
concept: [concept practiced]
score: [1-5]
strengths: [what was good]
gaps: [what needs work]
trend: [improving | plateauing | regressing]
```

---

## Key Findings
<!-- Claude updates this section every 3 sessions -->

pattern_gaps: []
consistent_strengths: []
recommended_focus: []

---

## Profile Site Note
This file is read by the Refract profile site to generate
the user's skill dashboard and key findings page.
Format must not be changed — site depends on this structure.
