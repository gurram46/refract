# Onboarding Setup

This file explains the onboarding flow used before the first concept starts.

## Flow

1. Ask user "Are you a beginner?"; if yes, skip all tests and go to basics.
2. If intermediate or expert, run three tests covering logic, DSA, and system-design trade-offs without syntax checks.
3. Pattern recognition test: show 5 problem descriptions, user identifies the pattern. No code. No language. Claude scores and writes `thinking_level` to `profile.md`.
4. Infer visual versus word preference from how the user responds instead of asking directly.
5. Write the inferred results to `profile.md`.
6. Begin the first concept after the profile is updated.
