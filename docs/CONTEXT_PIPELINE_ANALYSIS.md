# Context Management Pipeline Analysis

This document analyzes the context management pipeline in OpenClaw, identifying all points where prompts and context are injected into agent sessions, analyzing their frequency, and suggesting optimizations.

## 1. Overview of the Pipeline

The context for an agent session is constructed primarily in `src/agents/pi-embedded-runner/run/attempt.ts` and `src/agents/system-prompt.ts`. The `runEmbeddedAttempt` function orchestrates the entire process for a single turn of conversation.

### High-Level Flow:

1.  **Session Initialization/Loading:**
    -   `createAgentSession` initializes the session.
    -   `repairSessionFileIfNeeded` checks and fixes session file integrity.
    -   `prewarmSessionFile` pre-loads session content into memory.

2.  **System Prompt Construction (`buildEmbeddedSystemPrompt`):**
    -   This is the core of static and semi-static context injection.
    -   It assembles various sections: Identity, Tooling, Safety, Skills, Memory, Docs, Workspace, Runtime info, etc.

3.  **Bootstrap Files Injection (`resolveBootstrapContextForRun`):**
    -   Loads user-defined context files (e.g., `AGENTS.md`, `SOUL.md`, `MEMORY.md`, `BOOTSTRAP.md`).
    -   These are injected into the system prompt under "Workspace Files (injected)" or "Project Context".

4.  **Skills Injection (`resolveSkillsPromptForRun`):**
    -   Loads available skills from `skills/` directories.
    -   Formats skill descriptions for the system prompt to allow the model to discover and use them.

5.  **Hooks Injection (`runBeforeAgentStart`):**
    -   Plugins can inject dynamic context right before the agent starts processing.

6.  **Image Injection (`detectAndLoadPromptImages`):**
    -   Scans the prompt and history for image references and loads them.

7.  **History Management:**
    -   `sanitizeSessionHistory` cleans up and formats conversation history.
    -   `limitHistoryTurns` truncates history to fit within context limits.

## 2. Injection Points Analysis

### A. System Prompt (Static/Semi-Static)
*   **Source:** `src/agents/system-prompt.ts`
*   **Frequency:** Constructed **every turn**.
*   **Content:**
    -   **Identity:** "You are a personal assistant..."
    -   **Tooling:** List of available tools and their descriptions.
    -   **Safety:** Core safety guidelines.
    -   **Runtime Info:** OS, Node version, Agent ID, etc.
    -   **Time:** Current date/time.
*   **Analysis:**
    -   Most of this is fast to generate (string concatenation).
    -   Tool definitions can be large if many tools are enabled.
    -   **Optimization Opportunity:** The structure is largely static per session type. However, since it's just string manipulation in memory, it's not a major bottleneck compared to I/O.

### B. Bootstrap Files (User Context)
*   **Source:** `src/agents/bootstrap-files.ts` -> `src/agents/workspace.ts` (`loadWorkspaceBootstrapFiles`)
*   **Frequency:** Loaded from disk **every turn**.
*   **Content:**
    -   `AGENTS.md`: Agent definitions.
    -   `SOUL.md`: Persona/Tone.
    -   `TOOLS.md`: User guidance on tools.
    -   `MEMORY.md`: Long-term memory.
    -   `BOOTSTRAP.md`: Project-specific context.
*   **Analysis:**
    -   **Major Bottleneck:** `loadWorkspaceBootstrapFiles` reads multiple files from disk on *every single turn*.
    -   Even if files haven't changed, they are re-read and re-processed.
    -   **Optimization:** Implement caching based on file modification time (`mtime`) or file watchers.

### C. Skills (Dynamic Tooling)
*   **Source:** `src/agents/skills.ts` -> `src/agents/skills/workspace.ts` (`loadWorkspaceSkillEntries`)
*   **Frequency:** Loaded from disk **every turn**.
*   **Content:**
    -   Scans multiple directories: `bundled`, `managed`, `workspace/skills`, `~/.agents/skills`, etc.
    -   Reads `SKILL.md` or `package.json` for every skill to parse metadata.
*   **Analysis:**
    -   **Major Bottleneck:** This involves many `stat` and `readFile` operations, especially with many installed skills.
    -   It re-scans directories and re-reads skill definitions on every turn.
    -   **Optimization:** Cache skill definitions. Invalidate only when skill directories change.

### D. Hooks (Plugin Context)
*   **Source:** `src/agents/pi-embedded-runner/run/attempt.ts` -> `src/plugins/hook-runner-global.ts`
*   **Frequency:** Executed **every turn**.
*   **Content:** Dynamic context from plugins (e.g., `before_agent_start`).
*   **Analysis:**
    -   Depends on installed plugins.
    -   If plugins perform expensive operations (e.g., external API calls, DB queries) synchronously, this slows down the turn.
    -   **Optimization:** Ensure plugins use efficient caching internally. The core pipeline can mostly just ensure it doesn't block unnecessarily.

### E. Memory (RAG / Search)
*   **Source:** `src/agents/system-prompt.ts` (`buildMemorySection`) & `src/memory/`
*   **Frequency:** "Memory Recall" instructions are injected **every turn** if memory tools are available.
*   **Content:** Instructions to use `memory_search` / `memory_get`.
*   **Analysis:**
    -   The *instructions* are static.
    -   The *actual retrieval* happens via tool calls (LLM decides).
    -   **Optimization:** The instruction injection is cheap. The tool execution is where the cost lies (embedding search, DB lookup), which is outside the *injection* pipeline but part of the *execution* pipeline.

## 3. Recommendations for Optimization

### Priority 1: Bootstrap File Caching
*   **Problem:** `loadWorkspaceBootstrapFiles` reads `AGENTS.md`, `SOUL.md`, etc., from disk on every turn.
*   **Solution:** Introduce a memory cache for these files, keyed by workspace path.
    *   Store `{ content: string, mtime: number }`.
    *   On access, `stat` the file. If `mtime` hasn't changed, return cached content.
    *   This reduces `readFile` calls to `stat` calls, which are much cheaper (OS filesystem cache handles `stat` well).

### Priority 2: Skills Caching
*   **Problem:** `loadWorkspaceSkillEntries` scans multiple directories and reads metadata for all skills on every turn.
*   **Solution:** Cache the list of loaded skills.
    *   Use a file watcher (e.g., `chokidar` or simple `fs.watch`) on skill directories to invalidate the cache.
    *   Alternatively, for a simpler implementation without watchers, cache the results for a short TTL (e.g., 5-10 seconds) or check directory `mtime` if the OS supports it reliably for directory content changes (Linux/Unix often updates dir mtime on file add/remove).
    *   A "re-scan" command could be added for manual invalidation if watchers are too heavy.

### Priority 3: System Prompt Memoization (Minor)
*   **Problem:** `buildEmbeddedSystemPrompt` performs string concatenation every time.
*   **Solution:** Memoize parts of the system prompt that don't change often (e.g., Tool descriptions, Safety section).
    *   However, since `runtimeInfo` (time) and `contextFiles` (bootstrap files) change frequently, full memoization is hard.
    *   Given the cost of LLM inference and Disk I/O, string concatenation is likely negligible. **Low priority.**

### Priority 4: Reduce "Jitter" in Context
*   **Problem:** If context (like time or random identifiers) changes on every turn, it might break KV caching in the LLM provider (e.g., Anthropic Prompt Caching).
*   **Solution:**
    *   Ensure the *prefix* of the system prompt remains as stable as possible.
    *   Move highly dynamic parts (like "Current Time") to the *end* of the system prompt or into the User Message, so the static prefix can be cached by the provider.
    *   Currently, `buildAgentSystemPrompt` puts `Tooling` and `Safety` early (good for caching). `Time` is near the end (good). `Workspace Files` are at the end (good).
    *   **Action:** Verify that `Identity`, `Tooling`, and `Safety` come *before* dynamic content like `Time` or `Memory`.

## 4. Proposed Implementation Plan

1.  **Modify `src/agents/workspace.ts`:**
    -   Add a `BootstrapFileCache`.
    -   Update `loadWorkspaceBootstrapFiles` to use `stat` + cache.

2.  **Modify `src/agents/skills/workspace.ts`:**
    -   Add a `SkillEntryCache`.
    -   Update `loadSkillEntries` to use the cache.
    -   Implement a simple invalidation strategy (e.g., check `mtime` of the `skills` folder itself, or just cache for the duration of a "run" if appropriate, though "run" is one turn).

3.  **Refactor `buildAgentSystemPrompt` (Optional):**
    -   Review order of sections to maximize LLM KV cache hits.
    -   Ensure static sections are strictly at the top.
