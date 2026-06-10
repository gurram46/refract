---
concept: stacks
track: dsa
prereqs: queues
next: hashmaps
coding_levels: beginner, intermediate, expert
thinking_levels: beginner, intermediate, expert
---

# Stacks

## Story [everyone reads this]
You're typing a message and hit Ctrl+Z.
It undoes the last thing you typed — not the first thing,
the LAST thing. That's a stack.
LIFO. Last In First Out.
The last thing you did is the first thing undone.
Your browser back button. Your editor undo history.
Every function call your program makes.
All stacks.

## Visual [everyone reads this]
PUSH →  [      ]  ← only access point
[ undo3 ]  ← top (last in, first out)
[ undo2 ]
[ undo1 ]
[bottom ]

New item → goes on TOP
Remove item → always from TOP
Can never access middle directly

## The Code

### Beginner [pseudocode only]
stack = []
stack.push(action)      // add to top
stack.pop()             // remove from top
stack.peek()            // see top without removing

### Intermediate + Expert [Go]
```go
// slice as stack
stack := make([]string, 0)
stack = append(stack, "action1")        // push O(1)
top := stack[len(stack)-1]              // peek O(1)
stack = stack[:len(stack)-1]            // pop O(1)
```

### Expert [Go — with generics]
```go
type Stack[T any] struct {
    items []T
}
func (s *Stack[T]) Push(item T) { 
    s.items = append(s.items, item) 
}
func (s *Stack[T]) Pop() (T, bool) {
    var zero T
    if len(s.items) == 0 { return zero, false }
    top := s.items[len(s.items)-1]
    s.items = s.items[:len(s.items)-1]
    return top, true
}
```

## Why It Breaks [thinking_level: intermediate+]
Recursion is a stack in disguise.
Every function call pushes a frame onto the call stack.
Too many recursive calls = stack overflow.
That error message you've seen a hundred times?
That's a real stack running out of space.

## Game Theory Angle [thinking_level: intermediate+]
Two players editing the same Google Doc simultaneously.
Both hit undo at the same time.
Whose undo wins?
This is a coordination game — two agents, one shared stack,
conflicting moves.
Real solution: operational transforms — each player gets
their own stack, server merges them.
Distributed stack = distributed game with merge strategy.

## DSA Variants
- Basic Stack — undo/redo, browser history
- Monotonic Stack — next greater element, histogram problems
- Call Stack — recursion, function execution
- Min Stack — track minimum in O(1) at every state

## Backend + SQL Connection
Stack in production — browser session history:

```sql
CREATE TABLE user_actions (
    id SERIAL PRIMARY KEY,
    user_id INT,
    action JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Get last N actions for undo (stack behavior)
SELECT * FROM user_actions
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT 10;
```

LIFO = ORDER BY created_at DESC.
Stack is just a table sorted in reverse time order.

## System Design Angle
Where stacks appear in real systems:
- Browser back/forward → navigation stack
- Google Docs undo → operation stack
- Compiler → call stack, expression parsing
- Kubernetes rollback → deployment stack

## Interview Problem
Company: Google
Problem: Valid Parentheses — given a string of brackets,
determine if it is valid. Google asked this in SDE-1 rounds.

LeetCode:
- Easy: https://leetcode.com/problems/valid-parentheses/
- Medium: https://leetcode.com/problems/min-stack/
- Hard: https://leetcode.com/problems/largest-rectangle-in-histogram/

SD Equivalent: Design an undo/redo system for Google Docs.
Handle: concurrent users, operation history, 
merge conflicts, max undo depth.

## User Practice Problem
You are building Swiggy's order management system.
Restaurant owners can cancel the last placed order only.
Implement a system where:
- Orders can be placed
- Only the most recent order can be cancelled
- Once cancelled it cannot be recovered

Hint: which operation gives you the last item cheapest?

[Builds directly on the stack concept — 
copy pasting breaks the next problem which adds
min-price tracking on top of this]
