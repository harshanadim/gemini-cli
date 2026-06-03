/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type AgentLoopContext } from '../config/agent-loop-context.js';
import { GlobalWorkflowManager } from './manager.js';
import { LocalAgentExecutor } from '../agents/local-executor.js';
import { GeneralistAgent } from '../agents/generalist-agent.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { LocalAgentDefinition } from '../agents/types.js';
import { MessageBusType } from '../confirmation-bus/types.js';

export interface WorkflowAgentOptions {
  label?: string;
  schema?: Record<string, unknown>; // A generic JSON schema object
}

export class GeminiWorkflowContext {
  private readonly manager: GlobalWorkflowManager;

  constructor(
    private readonly hostContext: AgentLoopContext,
    private readonly abortSignal?: AbortSignal,
    _maxConcurrency = 5, // Deprecated, unused but kept for backwards compatibility in tests if any
  ) {
    // In our tests, `config` might be a stub that doesn't have getGlobalWorkflowManager.
    // We fall back to a local instance if not provided, though in production it should always exist.
    this.manager =
      hostContext.config?.getGlobalWorkflowManager?.() ??
      new GlobalWorkflowManager(
        hostContext.config?.getMaxWorkflowSubagents?.() ?? 20,
      );
  }

  /**
   * Spawns a subagent to execute a prompt, managed by the global manager.
   */
  async agent(prompt: string, opts?: WorkflowAgentOptions): Promise<unknown> {
    if (this.abortSignal?.aborted) {
      throw new Error('Workflow aborted');
    }

    const defaultLabel =
      prompt.length > 40 ? prompt.substring(0, 37) + '...' : prompt;
    const finalLabel = opts?.label ?? defaultLabel;

    return this.manager.runAgentTask(async () => {
      // 1. Notify UI that an agent is starting
      this.hostContext.messageBus?.emit(MessageBusType.WORKFLOW_SPAWN_AGENT, {
        type: MessageBusType.WORKFLOW_SPAWN_AGENT,
        data: { label: finalLabel, status: 'running' },
      });

      try {
        // 2. Build a LocalAgentDefinition based on Generalist
        const baseDef = GeneralistAgent(this.hostContext);

        let query = prompt;
        if (opts?.schema) {
          query += `\n\nYour final output MUST exactly match this JSON schema: ${JSON.stringify(opts.schema, null, 2)}`;
        }

        const agentDef: LocalAgentDefinition<z.ZodTypeAny> = {
          ...baseDef,
          name: `workflow_subagent_${randomUUID().substring(0, 8)}`,
          displayName: finalLabel,
          outputConfig: opts?.schema
            ? {
                outputName: 'result',
                description: 'The final structured result.',
                schema: z.unknown(),
              }
            : baseDef.outputConfig,
        };

        // 3. Create and run the executor
        const executor = await LocalAgentExecutor.create(
          agentDef,
          this.hostContext,
        );

        // Pass a new abort signal
        const controller = new AbortController();
        const abortHandler = () => controller.abort();
        this.abortSignal?.addEventListener('abort', abortHandler);

        let output;
        try {
          output = await executor.run({ request: query }, controller.signal);
        } finally {
          this.abortSignal?.removeEventListener('abort', abortHandler);
        }

        let finalResult: unknown = output.result;

        if (opts?.schema && typeof finalResult === 'string') {
          try {
            finalResult = JSON.parse(finalResult);
          } catch {
            // Return original string if not valid JSON
          }
        }

        this.hostContext.messageBus?.emit(MessageBusType.WORKFLOW_AGENT_END, {
          type: MessageBusType.WORKFLOW_AGENT_END,
          data: {
            label: finalLabel,
            status: 'completed',
            result: finalResult,
          },
        });

        return finalResult;
      } catch (error) {
        this.hostContext.messageBus?.emit(MessageBusType.WORKFLOW_AGENT_END, {
          type: MessageBusType.WORKFLOW_AGENT_END,
          data: { label: finalLabel, status: 'error', error: String(error) },
        });
        throw error;
      }
    });
  }

  /**
   * Helper to run multiple agent thunks concurrently (up to pool limit).
   */
  async parallel(thunks: Array<() => Promise<unknown>>): Promise<unknown[]> {
    return Promise.all(thunks.map((t) => t()));
  }

  /**
   * Helper to pipe items through sequential processing stages.
   */
  async pipeline(
    items: unknown[],
    ...stages: Array<
      (current: unknown, original: unknown, index: number) => Promise<unknown>
    >
  ): Promise<unknown[]> {
    const results: unknown[] = [];
    for (let i = 0; i < items.length; i++) {
      let current = items[i];
      for (const stage of stages) {
        current = await stage(current, items[i], i);
      }
      results.push(current);
    }
    return results;
  }

  /**
   * Marks a new phase in the workflow for UI grouping.
   */
  phase(title: string): void {
    this.hostContext.messageBus?.emit(MessageBusType.WORKFLOW_PHASE, {
      type: MessageBusType.WORKFLOW_PHASE,
      data: { title },
    });
  }

  /**
   * Logs a message to the workflow output.
   */
  log(message: string): void {
    this.hostContext.messageBus?.emit(MessageBusType.WORKFLOW_LOG, {
      type: MessageBusType.WORKFLOW_LOG,
      data: { message },
    });
  }

  /**
   * Returns an object containing the globals to inject into the sandbox.
   */
  getGlobals(): Record<string, unknown> {
    return {
      agent: this.agent.bind(this),
      parallel: this.parallel.bind(this),
      pipeline: this.pipeline.bind(this),
      phase: this.phase.bind(this),
      log: this.log.bind(this),
    };
  }
}
