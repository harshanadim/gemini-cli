/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DynamicWorkflowTool } from './dynamic-workflow.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import type { PolicyEngine } from '../policy/policy-engine.js';
import { WorkflowSandbox } from '../workflow/sandbox.js';

describe('DynamicWorkflowTool', () => {
  let mockContext: AgentLoopContext;
  let mockMessageBus: MessageBus;
  let tool: DynamicWorkflowTool;

  beforeEach(() => {
    const mockPolicyEngine = {} as PolicyEngine;
    mockMessageBus = new MessageBus(mockPolicyEngine);
    mockContext = {
      messageBus: mockMessageBus,
    } as AgentLoopContext;
    tool = new DynamicWorkflowTool(mockContext, mockMessageBus);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('run_dynamic_workflow');
    expect(tool.description).toContain('JavaScript orchestration script');
    const schema = tool.schema.parametersJsonSchema as {
      properties: { script: unknown };
    };
    expect(schema.properties.script).toBeDefined();
  });

  it('should execute a valid script and return the result', async () => {
    const script = `return 'workflow success';`;
    const invocation = tool.build({ script });

    // We can spy on the sandbox to ensure it gets called
    vi.spyOn(WorkflowSandbox, 'execute').mockResolvedValue('workflow success');

    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(WorkflowSandbox.execute).toHaveBeenCalledWith(
      script,
      expect.any(Object),
    );
    expect(result.data).toEqual({ result: 'workflow success' });
    expect(result.llmContent).toContain('workflow success');
  });

  it('should catch and return errors gracefully', async () => {
    const script = `throw new Error('sandbox crashed');`;
    const invocation = tool.build({ script });

    vi.spyOn(WorkflowSandbox, 'execute').mockRejectedValue(
      new Error('sandbox crashed'),
    );

    const result = await invocation.execute({
      abortSignal: new AbortController().signal,
    });

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain('sandbox crashed');
    expect(result.llmContent).toContain('sandbox crashed');
  });
});
