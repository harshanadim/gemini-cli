# Dynamic Workflows in Gemini CLI

## Overview

Implement "Dynamic Workflows" in the Gemini CLI. This feature allows the main
agent to write a JavaScript orchestration script that fans out work to multiple
subagents in parallel, executing that script in a highly restricted sandbox, and
rendering progress seamlessly in the CLI.

Inspired by "Claude Code" dynamic workflows, "Recursive Language Models"
(arxiv:2512.24601), and the deterministic execution model of
`pi-dynamic-workflows`.

## Architecture

1.  **The Orchestration Sandbox (`packages/core/src/workflow/sandbox.ts`)**
    - Uses Node's native `node:vm` module.
    - **Strict Security:** The sandbox is deeply isolated. No `require`, `fs`,
      `net`, `process`, or non-deterministic functions (`Date.now()`,
      `Math.random()`).
    - The script acts _only_ as pure orchestration. Any interaction with the
      host environment must be done by spawning a subagent.

2.  **The Workflow SDK (`packages/core/src/workflow/context.ts`)**
    - Injects a functional, declarative DSL into the sandbox:
      - `agent(prompt: string, opts?: { schema?: any })`: Spawns a subagent. If
        a JSON schema is provided, the subagent's `complete_task` is forced to
        return validated structured output.
      - `parallel(thunks: Array<() => Promise<any>>)`: Safe execution of
        parallel subagents.
      - `pipeline(items: any[], ...stages: Function[])`: Maps items through
        sequential stages.
      - `phase(title: string)`: Marks the current phase for CLI UI grouping.
      - `log(message: string)`: Appends to the workflow log.

3.  **The `run_dynamic_workflow` Tool
    (`packages/core/src/tools/dynamic-workflow.ts`)**
    - Schema: `{ script: string }`
    - Executes the provided JS string in the Sandbox, awaits the result, and
      returns it to the main agent.

4.  **Concurrency & Rate Limiting (`packages/core/src/workflow/pool.ts`)**
    - A `WorkflowTaskPool` manages subagent invocations (`agent()` calls).
    - Limits active concurrent LLM calls to avoid 429 Too Many Requests.
    - Handles exponential backoff transparently.

5.  **UI: The Workflow Dashboard
    (`packages/cli/src/ui/components/WorkflowProgress.tsx`)**
    - New `WorkflowActivityEvent` to stream pool state and `phase()` markers.
    - Ink-based dashboard rendering a live, collapsible tree of phases and
      subagent tasks.

## Step-by-Step Implementation Plan

### Phase 1: Core Execution Engine (Backend)

1.  **`WorkflowSandbox`**: Implement the `node:vm` execution wrapper with strict
    context stripping and timeout handling.
2.  **`GeminiWorkflowContext`**: Implement the SDK globals (`agent`, `parallel`,
    `phase`, `log`). Wire `agent()` to instantiate a `LocalAgentExecutor`.
    Ensure structured output schemas are passed to the subagent's
    `complete_task` tool.
3.  **Concurrency Pool**: Implement the task queue and rate limiting logic.

### Phase 2: Tool & Prompting (Agent Logic)

1.  **`DynamicWorkflowTool`**: Create the `BaseDeclarativeTool` subclass.
2.  **Update Prompts**: Update `packages/core/src/prompts/snippets.ts` to
    instruct the generalist agent on using the new tool and the injected SDK for
    parallelized tasks.
3.  **Register Tool**: Add it to the main `generalist-agent` tool registry.

### Phase 3: Observability & CLI UI (Frontend)

1.  **Event Bus**: Define new workflow events (`WORKFLOW_START`,
    `WORKFLOW_PHASE`, `WORKFLOW_SPAWN_AGENT`, `WORKFLOW_END`).
2.  **Session Manager**: Forward workflow events to the frontend.
3.  **Ink Components**: Build the concurrent task visualization in
    `packages/cli`, grouping tasks by phase.

### Phase 4: Safeguards & Testing

1.  **Cost Control**: Add `general.maxWorkflowSubagents` config to cap token
    usage.
2.  **Rate Limit Resilience**: Enhance model routing layer error catching for
    spike traffic.
3.  **E2E Testing**: Write `TestRig` integration tests simulating a workflow
    script fanning out to multiple agents and asserting the aggregated result.
