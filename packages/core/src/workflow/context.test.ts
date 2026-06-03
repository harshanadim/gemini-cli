/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiWorkflowContext } from './context.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { Config } from '../config/config.js';

vi.mock('../agents/local-executor.js', () => ({
  LocalAgentExecutor: {
    create: vi.fn().mockResolvedValue({
      run: vi.fn().mockResolvedValue({ result: 'mocked result' }),
    }),
  },
}));

vi.mock('../agents/generalist-agent.js', () => ({
  GeneralistAgent: vi.fn().mockReturnValue({
    name: 'test_agent',
    displayName: 'Test Agent',
    promptConfig: { query: 'test' },
    outputConfig: { outputName: 'result' },
  }),
}));

describe('GeminiWorkflowContext', () => {
  let mockContext: AgentLoopContext;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getMaxWorkflowSubagents: () => 2,
      getApprovalMode: () => 'default',
    } as unknown as Config;

    mockContext = {
      config: mockConfig,
      messageBus: { emit: vi.fn() } as unknown as MessageBus,
      toolRegistry: { getAllToolNames: () => ['test_tool'] },
    } as unknown as AgentLoopContext;
  });

  it('should allow spawning agents up to the limit', async () => {
    const context = new GeminiWorkflowContext(mockContext, 'w1');

    await expect(context.agent('test 1')).resolves.toBe('mocked result');
    await expect(context.agent('test 2')).resolves.toBe('mocked result');
  });

  it('should throw an error when exceeding the agent limit', async () => {
    const context = new GeminiWorkflowContext(mockContext, 'w1');
    await context.agent('test 1');
    await context.agent('test 2');

    await expect(context.agent('test 3')).rejects.toThrow(
      'Maximum workflow subagents limit',
    );
  });
});
