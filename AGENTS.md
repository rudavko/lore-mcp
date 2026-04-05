# AI-native codebase

This codebase is primarily read and modified by AI agents. Human readability conventions (line count limits, "too many parameters", extract-for-clarity refactors) do not apply. Only flag code issues that would cause problems for you as an AI consumer — unclear naming, ambiguous control flow, missing context for decision-making. Flat, repetitive, verbose code is fine if each line is unambiguous.

Do not claim you can "verify correctness by reading." You cannot. You hallucinate, miss edge cases, and lose context across sessions. Tests are your verification mechanism. Missing tests for business logic is always a real issue.

Deployment model rule: for our MCPs, this repository is the source repo only. The target repo is a different downstream repo created during single-click Cloudflare deployment.
Target repo inference rule: do not assume the source repo Git remote is the auto-updates target repo unless an explicit deploy-time configuration says so.
Script execution rule: do not run ad hoc one-off script calls. If execution is needed, use only checked-in `package.json` entrypoints via `bun run <script-name>` or `npm run <script-name>`. If no such entrypoint exists yet, add one first and then run it through `bun run` or `npm run`.
