/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
  type ExecuteOptions,
} from './tools.js';
import { type MessageBus } from '../confirmation-bus/message-bus.js';
import { type AgentLoopContext } from '../config/agent-loop-context.js';
import { GeminiWorkflowContext } from '../workflow/context.js';
import { WorkflowSandbox } from '../workflow/sandbox.js';
import { DYNAMIC_WORKFLOW_TOOL_NAME } from './tool-names.js';

import { MessageBusType } from '../confirmation-bus/types.js';

export class DynamicWorkflowTool extends BaseDeclarativeTool<
  { script: string },
  ToolResult
> {
  static readonly Name = DYNAMIC_WORKFLOW_TOOL_NAME;

  constructor(
    private readonly context: AgentLoopContext,
    messageBus: MessageBus,
  ) {
    super(
      DYNAMIC_WORKFLOW_TOOL_NAME,
      'Run Dynamic Workflow',
      'Executes a JavaScript orchestration script to parallelize and coordinate multiple subagents.',
      Kind.Agent,
      {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description:
              'The JavaScript code to execute. Must be valid JavaScript that orchestrates tasks via the injected SDK (agent, parallel, etc).',
          },
        },
        required: ['script'],
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: { script: string },
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
  ): DynamicWorkflowInvocation {
    return new DynamicWorkflowInvocation(
      params,
      messageBus,
      toolName,
      toolDisplayName,
      this.context,
    );
  }
}

export class DynamicWorkflowInvocation extends BaseToolInvocation<
  { script: string },
  ToolResult
> {
  constructor(
    params: { script: string },
    messageBus: MessageBus,
    toolName: string,
    toolDisplayName: string,
    private readonly context: AgentLoopContext,
  ) {
    super(params, messageBus, toolName, toolDisplayName);
  }

  getDescription(): string {
    return `Executing dynamic workflow script.`;
  }

  async execute(_options: ExecuteOptions): Promise<ToolResult> {
    const workflowContext = new GeminiWorkflowContext(this.context);
    const globals = workflowContext.getGlobals();

    this.messageBus.emit(MessageBusType.WORKFLOW_START, {
      type: MessageBusType.WORKFLOW_START,
    });

    try {
      const result = await WorkflowSandbox.execute(this.params.script, globals);
      const outputStr =
        typeof result === 'string' ? result : JSON.stringify(result, null, 2);

      const dataPayload: Record<string, unknown> =
        typeof result === 'object' && result !== null
          ? { ...result }
          : { result };

      return {
        llmContent: `Workflow executed successfully. Result: ${outputStr}`,
        returnDisplay: `Workflow completed.`,
        data: dataPayload,
      };
    } catch (error) {
      return {
        llmContent: `Workflow execution failed: ${error}`,
        returnDisplay: `Workflow execution failed: ${error}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      this.messageBus.emit(MessageBusType.WORKFLOW_END, {
        type: MessageBusType.WORKFLOW_END,
      });
    }
  }
}
