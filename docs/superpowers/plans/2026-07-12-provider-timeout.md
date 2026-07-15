# Provider Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Increase the default NVIDIA per-model response timeout to 180 seconds.

**Architecture:** Keep the existing injected `timeoutMs` provider option and sequential fallback loop. Change only the production default and add deterministic timer-based regression coverage.

**Tech Stack:** Node.js ESM and `node:test`.

## Global Constraints

- Default timeout is exactly 180,000 milliseconds per model.
- Existing explicit `timeoutMs` injection remains unchanged.
- Existing five-model order and stop-on-success behavior remain unchanged.

---

### Task 1: Default Provider Timeout

**Files:**
- Modify: `backend/test/provider-and-logging.test.js`
- Modify: `backend/src/lib/aiProvider.js:12`

**Interfaces:**
- Consumes: `createAiProvider({ timeoutMs? })`
- Produces: a 180,000 ms default when `timeoutMs` is omitted.

- [ ] **Step 1: Add a failing test using an injected timer or exported default to prove the default delay is 180,000 ms.**
- [ ] **Step 2: Run `node --test test/provider-and-logging.test.js` and confirm the assertion receives 30,000 ms.**
- [ ] **Step 3: Change `REQUEST_TIMEOUT_MS` from `30_000` to `180_000`.**
- [ ] **Step 4: Run the focused provider tests and full `npm test`.**
- [ ] **Step 5: Restart the backend from the current worktree and verify `/health`.**

No commit is included because the user did not request one.
