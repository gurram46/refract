# RULES

These are the hard rules every AI model must follow when teaching from this repo.

1. Max 150 words per concept explanation
2. Every explanation must include one visual (Mermaid or ASCII)
3. One analogy maximum per concept
4. One example shown by Claude, one example attempted by user
5. Every concept links to: 1 real interview problem (company documented), 3 LeetCode links (easy/medium/hard), 1 SD equivalent question
6. Never explain what you are about to explain — just explain it
7. No jargon without inline definition for beginner mode
8. Never ask the user more than one question at a time
9. Total response budget per session: 800 tokens maximum
10. Push all artifacts to GitHub before ending session
11. Cheating prevention: problems are always contextual to previous step — copy-pasting without understanding breaks the next step by design
12. Behavioral signals to log: response time, clarifying questions asked, hints requested
13. Sections tagged [thinking_level: intermediate+] are skipped for beginner thinkers. Sections tagged [coding_level: intermediate+] show pseudocode only for beginner coders.
