---
concept: queues
track: dsa
prereqs: none
next: stacks
coding_levels: beginner, intermediate, expert
thinking_levels: beginner, intermediate, expert
---

# Queues

## Story [everyone reads this]
Imagine you open Swiggy and place an order. 
Your order doesn't teleport to the kitchen — it joins a line. 
First order placed, first order made. That's a queue. 
FIFO. First In First Out. The restaurant doesn't pick 
randomly, doesn't pick the richest customer, picks whoever 
came first. That's the rule. That's the whole concept.

## Visual [everyone reads this]
ASCII only, no mermaid yet:

Order 1 → Order 2 → Order 3 → Order 4
[FRONT]                         [BACK]

New order comes in → joins at BACK
Kitchen processes → takes from FRONT

## The Code
### Beginner [pseudocode only]
```
queue = []
queue.add_to_back(order)     // enqueue
queue.take_from_front()      // dequeue
```

### Intermediate + Expert [Go]
```go
// go
queue := make([]string, 0)
queue = append(queue, "order1")   // enqueue O(1)
front := queue[0]                  // peek
queue = queue[1:]                  // dequeue O(n) — we fix this with channels
```

Channel version [Expert]:
```go
// go
orders := make(chan string, 100)
orders <- "order1"    // enqueue
order := <-orders     // dequeue — Go native, concurrent safe
```

## Why It Breaks [thinking_level: intermediate+]
Big Billion Day. 10,000 orders hit Swiggy in 60 seconds.
Kitchen processes 100 orders per minute.
Queue grows faster than it drains.
That's backpressure. The queue is honest — it shows you 
exactly where your system is lying about its capacity.

## Game Theory Angle [thinking_level: intermediate+]
10 delivery drivers. 50 orders in queue.
Each driver picks the closest order — selfish agent.
Result: orders near drivers get picked instantly, 
far orders wait forever. Queue starves.
This is a resource competition game with no coordination.
Fix: weighted queue — far orders get priority boost over time.
Now selfish agents produce fair collective outcome.
That's mechanism design. Queue structure = incentive structure.

## DSA Variants
- FIFO Queue — Swiggy orders, printer jobs
- Circular Queue — fixed memory, Ring Buffer, OS scheduling
- Priority Queue — ambulance before auto, Dijkstra's algorithm
- Deque — undo/redo, sliding window problems

## Backend + SQL Connection
Queue in production is not an array.
It's a database table:

```sql
CREATE TABLE job_queue (
  id SERIAL PRIMARY KEY,
  payload JSONB,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

SELECT * FROM job_queue 
WHERE status = 'pending' 
ORDER BY created_at ASC 
LIMIT 1 FOR UPDATE SKIP LOCKED;
```

SKIP LOCKED = multiple workers can pull from queue 
without stepping on each other. That's concurrent 
queue processing in one SQL line.

## System Design Angle
Where queues appear in real systems:
- Swiggy order processing → job queue
- Zomato notifications → message queue  
- Payment retry pipeline → dead letter queue
- Amazon order system → priority queue with SLA tiers

## Interview Problem
Company: Amazon  
Problem: Design a queue that supports getMin() in O(1)  
This was asked in Amazon SDE-1 interviews 2023-2024.

LeetCode:
- Easy: https://leetcode.com/problems/implement-queue-using-stacks/
- Medium: https://leetcode.com/problems/design-circular-queue/
- Hard: https://leetcode.com/problems/number-of-visible-people-in-a-queue/

SD Equivalent: Design Swiggy's order processing queue  
Handle: 10k orders/min, driver assignment, retry on failure, 
priority for Prime users.

## User Practice Problem
Swiggy just launched Swiggy Instant — 10 minute delivery.  
Orders older than 10 minutes in queue get auto-cancelled.  
Implement a queue that automatically removes 
expired orders from the front.  
Hint: what data structure lets you check the front cheaply?

[This problem only works if you understood the explained 
example — copy pasting breaks the next step which builds 
a priority queue on top of this]
