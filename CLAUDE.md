# AI-native codebase

This codebase is primarily read and modified by AI agents. Human readability conventions (line count limits, "too many parameters", extract-for-clarity refactors) do not apply. Only flag code issues that would cause problems for you as an AI consumer — unclear naming, ambiguous control flow, missing context for decision-making. Flat, repetitive, verbose code is fine if each line is unambiguous.

Do not claim you can "verify correctness by reading." You cannot. You hallucinate, miss edge cases, and lose context across sessions. Tests are your verification mechanism. Missing tests for business logic is always a real issue.
