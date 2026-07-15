# Provider Chain Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe, correlated backend logs for every model attempt and the final NVIDIA fallback-chain result.

**Architecture:** Extend `createAiProvider` with an injectable chain-ID factory and chain-level timing. Preserve the existing provider API and request events while adding structured chain and attempt events around the current sequential model loop.

**Tech Stack:** Node.js ESM, built-in `crypto.randomUUID`, `node:test`, structured JSON logger.

## Global Constraints

- Model order remains GLM 5.2, DeepSeek V4 Pro, MiniMax M3, DeepSeek V4 Flash, then MiniMax M2.7.
- Stop at the first successful model response.
- Never log API keys, authorization values, request messages, prompts, response bodies, or generated content.
- Do not change API response bodies.

---

### Task 1: Correlated Provider Chain Events

**Files:**
- Modify: `backend/test/provider-and-logging.test.js:236-390`
- Modify: `backend/src/lib/aiProvider.js:1-188`

**Interfaces:**
- Consumes: `createAiProvider({ env, fetchImpl, logger, now, timeoutMs })`
- Produces: optional `createChainId: () => string` dependency and structured `provider.chain.*` / `provider.attempt.*` logger events.

- [ ] **Step 1: Write failing success and failure event tests**

Add tests using `captureLogger()`, deterministic `now`, and `createChainId: () => "chain-1"`. Assert exact event metadata for a primary failure followed by fallback success, and for all configured models failing. Assert serialized logs exclude `API_KEY`, prompt text, authorization, and response content.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `node --test --test-name-pattern="provider chain" test/provider-and-logging.test.js`

Expected: FAIL because `provider.chain.started`, `provider.attempt.*`, and terminal chain events do not exist.

- [ ] **Step 3: Implement minimal structured logging**

Import `randomUUID` from `node:crypto`. In `complete`, create one chain ID, record chain start time, and emit:

```js
logger.info("provider.chain.started", { chainId, modelCount: models.length });
logger.info("provider.attempt.started", { chainId, attempt: index + 1, totalAttempts: models.length, model });
```

On each attempt failure or success, emit stable metadata only. Emit one `provider.chain.succeeded` before returning and one `provider.chain.failed` before throwing the final typed error. Include `chainId` on `provider.fallback.started`.

- [ ] **Step 4: Run focused tests and verify success**

Run: `node --test test/provider-and-logging.test.js`

Expected: all provider and logging tests pass.

- [ ] **Step 5: Run full backend verification**

Run: `npm test`

Expected: all backend tests and all 100 smoke checks pass.

- [ ] **Step 6: Restart and verify the live backend logger**

Restart `backend/src/server.js` from the current worktree. Send one generation request, then inspect `C:\Users\Dell\AppData\Local\Temp\opencode\refract-backend.log` for a single chain ID spanning all attempts and exactly one terminal chain event.

No commit is included because the user did not request one.
