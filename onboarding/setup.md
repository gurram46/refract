# Refract Onboarding

## What Claude does here
Read this file fully before saying anything to the user.
Execute the flow below exactly. Write results to profile.md when done.
Do not skip steps. Do not add extra questions.

---

## STEP 0 — Goal check

Ask the user exactly this:

"What's your goal?
1. Crack a product company interview
2. Get into a startup
3. Understand how systems work
4. Just curious"

1 → goal: interview
2 → goal: startup
3 → goal: systems
4 → goal: curious

If user picks more than one goal →
ask exactly: "Which one is more important to you right now?"
Then write that one to `profile.md` as primary `goal`.
Write the other as `secondary_goal: [value]`.

Example output:
```yaml
goal: interview
secondary_goal: startup
```

If user seems confused, picks multiple goals without clear primary,
or says "I don't know" → show this exactly before asking again:

"Quick reality check:
- Google/Amazon goal → DSA patterns + system design
- Startup goal → backend projects + shipping fast  
- Just exploring → DSA only, no language pressure

All three start the same way.
You can change this anytime by editing profile.md.
Pick one for now."

Then ask the goal question again once.

User can update goal anytime by editing `profile.md`.
Claude re-adapts at next session start automatically.

---

## STEP 1 — Coding history check

Ask the user exactly this, nothing else:

"Have you written code before, even a little?"

If NO → set coding_level: beginner, thinking_level: beginner, skip STEP 2, and go to STEP 3.

If YES → go to STEP 1A.

---

## STEP 1A — Coding level check

Ask exactly this:

"Pick the one that fits you best:
1. I have never written code
2. I know basics — variables, loops, functions
3. I have built projects before"

1 → coding_level: beginner, thinking_level: beginner, skip STEP 2
2 → coding_level: intermediate, go to STEP 2 and ask Question 1 only
3 → coding_level: expert, go to STEP 2 and ask all 3 questions

---

## STEP 2 — Pattern Recognition Test

Only run this step for users with coding_level: intermediate or expert.

Tell the user exactly this before starting:

"Quick pattern check. No code. No googling needed. 
Just tell me what pattern you think the problem uses."

Ask one at a time. Wait for answer before next question.

If coding_level: intermediate → ask Question 1 only.
If coding_level: expert → ask all 3 questions.

### Question 1 [Easy]
"You have a list of Swiggy orders coming in every second.
Find the maximum number of orders in any 3-second window.
What pattern is this?"

Expected: Sliding Window
Accept also: window, moving window

### Question 2 [Medium]
"You have a city map as a grid. 
A fire starts at one point and spreads to adjacent cells.
Find how many minutes until the whole city burns.
What pattern is this?"

Expected: BFS
Accept also: breadth first, queue + BFS, level traversal

### Question 3 [Hard]
"You have a list of buildings with heights.
For each building find how many buildings it can see 
to its right before a taller one blocks the view.
What pattern is this?"

Expected: Monotonic Stack
Accept also: stack, decreasing stack

### Scoring
For coding_level: intermediate:
- Question 1 correct → thinking_level: intermediate
- Question 1 wrong → thinking_level: beginner

For coding_level: expert:
- 3/3 → thinking_level: expert
- 2/3 → thinking_level: intermediate
- 1/3 or 0/3 → thinking_level: beginner

### After scoring tell the user their result in one line:
"Got it. You think at [level] level."
Nothing more.

---

## STEP 3 — Language track check

Ask exactly this:

"What do you want to build?
1. Backend and servers
2. Just DSA and problem solving, no specific language
3. Something else"

1 → language_track: go
2 → language_track: none
3 → language_track: go

If language_track: none, teach in pure DSA mode with pseudocode only.

---

## STEP 4 — Visual preference check

Do NOT ask directly. Instead say:

"Last thing. I am going to explain something quickly.
Tell me if this makes sense:

A queue is like a Swiggy order line — 
first order placed is first order made.
New orders join at the back.
Kitchen always picks from the front."

If user says "yes" / "got it" / "makes sense" → 
  ask: "Did you need a diagram or was the words enough?"
  Words enough → visual_preference: low
  If user says they needed a diagram →
    visual_preference: high
    show this ASCII before proceeding:

    Order 1 → Order 2 → Order 3 → Order 4
    [FRONT]                         [BACK]

    New orders join at BACK  
    Kitchen picks from FRONT

    Then say exactly: "Got it. I'll always show you visuals first."
    Then continue to STEP 5.

If user asks for more explanation or seems confused →
  visual_preference: high
  thinking_level drops one level if they were intermediate

---

## STEP 5 — Write to profile.md

Before writing profile.md, ask exactly this:

"What should I call you?"

After all steps write exactly this to profile.md,
filling in the values from the test:

```yaml
name: [user's answer]
goal: [interview | startup | systems | curious]
secondary_goal: [interview | startup | systems | curious] ← only if user picked more than one goal
goal_locked: false
mode: [beginner | intermediate | expert] ← use thinking_level
coding_level: [beginner | intermediate | expert]
thinking_level: [beginner | intermediate | expert]
visual_preference: [high | medium | low]
language_track: [go | none]
started: [today's date]
last_session: [today's date]
current_concept: queues
next_concept: stacks
```

---

## STEP 6 — Start immediately

After writing profile.md say exactly this one line:

"Profile saved. Starting with Queues. Here we go."

Then immediately begin teaching dsa/queues.md 
adapted to their levels. No pause. No asking if ready.
Just teach.

---

## Hard rules for onboarding
- Never ask more than one question at a time
- Never explain what you are about to do — just do it
- Never say "great answer" or "well done" — just proceed
- If user gives wrong pattern recognition answer, just score it silently and move on
- Never run pattern recognition for users who have never coded
- Users with basic or college-level coding get only the easy pattern question
- Users who have built projects get all three pattern questions
- Total onboarding should take under 5 minutes
