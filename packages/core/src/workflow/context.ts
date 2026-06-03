/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type AgentLoopContext } from '../config/agent-loop-context.js';
import { WorkflowTaskPool } from './pool.js';
import { LocalAgentExecutor } from '../agents/local-executor.js';
import { GeneralistAgent } from '../agents/generalist-agent.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { LocalAgentDefinition } from '../agents/types.js';
import { MessageBusType } from '../confirmation-bus/types.js';

export interface WorkflowAgentOptions {
  label?: string;
  schema?: any; // A generic JSON schema object
}

export class GeminiWorkflowContext {
  private readonly pool: WorkflowTaskPool;

  constructor(
    private readonly hostContext: AgentLoopContext,
    maxConcurrency = 5
  ) {
    this.pool = new WorkflowTaskPool(maxConcurrency);
  }

  /**
   * Spawns a subagent to execute a prompt, managed by the task pool.
   */
  async agent(prompt: string, opts?: WorkflowAgentOptions): Promise<any> {
    return this.pool.run(async () => {
      // 1. Notify UI that an agent is starting
      this.hostContext.messageBus?.emit(MessageBusType.WORKFLOW_SPAWN_AGENT, {
        type: MessageBusType.WORKFLOW_SPAWN_AGENT,
        data: { label: opts?.label, status: 'running' }
      });

      try {
        // 2. Build a LocalAgentDefinition based on Generalist
        const baseDef = GeneralistAgent(this.hostContext);
        
        let outputSchema: z.ZodTypeAny = z.string();
        if (opts?.schema) {
            outputSchema = z.any(); // In a real implementation we would convert the JSON schema to Zod.
        }

        const agentDef: LocalAgentDefinition<any> = {
          ...baseDef,
          name: `workflow_subagent_${randomUUID().substring(0,8)}`,
          displayName: opts?.label ?? 'Workflow Subagent',
          promptConfig: {
            ...baseDef.promptConfig,
            query: prompt,
          },
          outputConfig: opts?.schema ? {
              outputName: 'result',
              description: 'The final structured result.',
              schema: outputSchema 
          } : baseDef.outputConfig,
        };

        // 3. Create and run the executor
        const executor = await LocalAgentExecutor.create(agentDef, this.hostContext);
        
        // Pass a new abort signal
        const controller = new AbortController();
        const output = await executor.run({ request: prompt }, controller.signal);

        this.hostContext.messageBus?.emit(MessageBusType.WORKFLOW_AGENT_END, {
            type: MessageBusType.WORKFLOW_AGENT_END,
            data: { label: opts?.label, status: 'completed', result: output.result }
        });
        
        if (opts?.schema) {
            try {
               return typeof output.result === 'string' ? JSON.parse(output.result) : output.result;
            } catch {
                return output.result;
            }
        }
        
        return output.result;
      } catch (error) {
        this.hostContext.messageBus?.emit(MessageBusType.WORKFLOW_AGENT_END, {
            type: MessageBusType.WORKFLOW_AGENT_END,
            data: { label: opts?.label, status: 'error', error: String(error) }
        });
        throw error;
      }
    });
  }

  /**
   * Helper to run multiple agent thunks concurrently (up to pool limit).
   */
  async parallel(thunks: Array<() => Promise<any>>): Promise<any[]> {
    return Promise.all(thunks.map(t => t()));
  }

  /**
   * Helper to pipe items through sequential processing stages.
   */
  async pipeline(items: any[], ...stages: Function[]): Promise<any[]> {
      const results = [];
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
        data: { title }
    });
  }

  /**
   * Logs a message to the workflow output.
   */
  log(message: string): void {
    this.hostContext.messageBus?.emit(MessageBusType.WORKFLOW_LOG, {
        type: MessageBusType.WORKFLOW_LOG,
        data: { message }
    });
  }

  /**
   * Returns an object containing the globals to inject into the sandbox.
   */
  getGlobals(): Record<string, any> {
    return {
      agent: this.agent.bind(this),
      parallel: this.parallel.bind(this),
      pipeline: this.pipeline.bind(this),
      phase: this.phase.bind(this),
      log: this.log.bind(this),
    };
  }
}
