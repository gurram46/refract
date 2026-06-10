# Game Theory Foundations

This file defines the game theory scope Refract uses across concept files. It is guidance for Claude/GPT, not a fixed script for users.

## Core Rule

Do not reuse canned stories. Generate the game theory story from the current concept, user goal, and system context. Keep it concrete, practical, and tied to software behavior.

## Layer 1 — Foundational [everyone]

Use this layer for every learner.

- Game: players making choices under rules that produce outcomes.
- Players: users, services, workers, drivers, clients, servers, queues, or attackers.
- Rules: the system constraints that shape what each player can do.
- Outcome: the result created by everyone acting at the same time.
- Selfish agent: a player that optimizes for its own benefit.
- Stable state: a situation where no player has a reason to change behavior.
- Nash equilibrium: a stable state where each player is already making their best move given everyone else's move.

## Layer 2 — Applied To Systems [thinking_level: intermediate+]

Use this layer when the concept touches coordination, scale, or resource limits.

- Zero-sum: one player gains only when another loses.
- Non-zero-sum: players can all gain or all lose depending on system design.
- Congestion game: many players compete for limited shared capacity.
- Mechanism design: changing the rules so selfish behavior produces a better system outcome.
- Incentive alignment: making the easiest action for each player also help the system.
- Fairness: preventing one class of player or request from being starved forever.

## Layer 3 — Advanced [thinking_level: expert]

Use this layer only when the concept reaches distributed systems, adversarial behavior, or market-style allocation.

- Prisoner's dilemma: individually rational choices create a worse shared outcome.
- Byzantine behavior: some players may lie, fail, or act maliciously.
- Auction theory: resources are allocated through bids, prices, and scarcity.
- Trust boundaries: parts of the system must assume other parts may behave badly.
- Strategy-proof design: players cannot improve their result by lying about their intent.

## How Claude Should Use This

1. Identify the players in the current concept.
2. Identify what each player wants.
3. Identify the shared constraint or conflict.
4. Explain the stable or unstable outcome.
5. Show how changing the data structure, API, queue, rule, or incentive changes behavior.
6. Keep the explanation under the repo response budget.
7. Do not mention academic terms unless immediately explained inline.
8. Do not add unrelated game theory concepts just because they sound advanced.

## Good Game Theory Angle Shape

```text
Players: [who competes or coordinates]
Rule: [what the system allows]
Incentive: [what each player wants]
Failure: [what breaks if everyone acts selfishly]
Fix: [how the system rule changes behavior]
Result: [why the new outcome is more stable or fair]
```

## What To Avoid

- Do not use abstract textbook explanations.
- Do not force game theory into a concept where it does not clarify behavior.
- Do not repeat the same food delivery, browser, or editor story in every file.
- Do not invent real-world claims that need sourcing.
- Do not turn this into economics theory; keep it tied to software systems.
