/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GlobalWorkflowManager } from './manager.js';

describe('GlobalWorkflowManager', () => {
  it('should track invocations and allow tasks up to limit', async () => {
    const manager = new GlobalWorkflowManager(2);

    await expect(manager.runAgentTask(async () => 'task 1')).resolves.toBe(
      'task 1',
    );
    await expect(manager.runAgentTask(async () => 'task 2')).resolves.toBe(
      'task 2',
    );

    expect(manager.getInvocations()).toBe(2);
  });

  it('should throw an error when exceeding the global limit', async () => {
    const manager = new GlobalWorkflowManager(2);

    await manager.runAgentTask(async () => 'task 1');
    await manager.runAgentTask(async () => 'task 2');

    await expect(manager.runAgentTask(async () => 'task 3')).rejects.toThrow(
      'Maximum workflow subagents limit (2) exceeded globally',
    );
  });

  it('should reset invocation counts correctly', async () => {
    const manager = new GlobalWorkflowManager(2);

    await manager.runAgentTask(async () => 'task 1');
    expect(manager.getInvocations()).toBe(1);

    manager.reset();
    expect(manager.getInvocations()).toBe(0);

    await expect(manager.runAgentTask(async () => 'task 2')).resolves.toBe(
      'task 2',
    );
  });
});
