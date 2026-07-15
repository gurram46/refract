# Provider Timeout Design

## Goal

Allow slower NVIDIA models enough time to return a response before the fallback chain advances.

## Behavior

Each model receives up to 180 seconds. A successful response stops the chain. A timeout or any other provider failure advances to the next model in the existing order. The timeout remains injectable for fast deterministic tests.

The model order remains:

1. `z-ai/glm-5.2`
2. `deepseek-ai/deepseek-v4-pro`
3. `minimaxai/minimax-m3`
4. `deepseek-ai/deepseek-v4-flash`
5. `minimaxai/minimax-m2.7`

## Testing

A regression test will capture the default timer delay and assert that it is 180,000 milliseconds. Existing injected-timeout and fallback-order tests must continue to pass.
