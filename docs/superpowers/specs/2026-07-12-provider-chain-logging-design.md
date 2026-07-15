# Provider Chain Logging Design

## Goal

Make each NVIDIA fallback request traceable in backend logs so model failures and fallback order can be diagnosed without exposing prompts, generated content, credentials, or authorization headers.

## Logging Contract

Each `complete` call receives a generated `chainId`. The provider emits structured JSON events for:

- `provider.chain.started`: chain ID and configured model count.
- `provider.attempt.started`: chain ID, one-based attempt number, total attempts, and model.
- `provider.attempt.failed`: the same attempt metadata plus stable error code, HTTP status when available, and duration.
- `provider.attempt.succeeded`: the same attempt metadata plus duration.
- `provider.fallback.started`: chain ID, failed model, next model, and failure code.
- `provider.chain.succeeded`: chain ID, successful model, attempt count, fallback usage, and total duration.
- `provider.chain.failed`: chain ID, total attempts, final error code, and total duration.

Existing provider request events may remain for compatibility, but the chain events are the primary diagnostic record.

## Safety

Logs must not contain API keys, authorization values, request messages, prompts, provider response bodies, or generated artifact content. Errors use stable codes rather than raw exception messages.

## Testing

Provider tests will verify event order and metadata for immediate success, fallback success, and complete chain failure. Existing redaction tests will continue verifying that prompts, headers, and secrets are absent.
