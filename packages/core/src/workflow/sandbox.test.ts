/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { WorkflowSandbox } from './sandbox.js';

describe('WorkflowSandbox', () => {
  it('should execute basic JavaScript', async () => {
    const script = `return 1 + 1;`;
    const result = await WorkflowSandbox.execute(script, {});
    expect(result).toBe(2);
  });

  it('should have access to injected globals', async () => {
    const script = `return agent('test');`;
    const mockAgent = vi.fn().mockResolvedValue('success');
    const result = await WorkflowSandbox.execute(script, { agent: mockAgent });
    
    expect(result).toBe('success');
    expect(mockAgent).toHaveBeenCalledWith('test');
  });

  it('should throw when accessing disabled non-deterministic functions', async () => {
    const scriptDate = `return Date.now();`;
    await expect(WorkflowSandbox.execute(scriptDate, {})).rejects.toThrow('Date.now() is disabled');

    const scriptMath = `return Math.random();`;
    await expect(WorkflowSandbox.execute(scriptMath, {})).rejects.toThrow('Math.random() is disabled');
  });

  it('should block access to require and process', async () => {
    const scriptRequire = `return require('fs');`;
    await expect(WorkflowSandbox.execute(scriptRequire, {})).rejects.toThrow('require is not defined');

    const scriptProcess = `return process.cwd();`;
    await expect(WorkflowSandbox.execute(scriptProcess, {})).rejects.toThrow('process is not defined');
  });

  it('should proxy console.log to injected log function', async () => {
    const script = `console.log('hello workflow');`;
    const mockLog = vi.fn();
    await WorkflowSandbox.execute(script, { log: mockLog });
    expect(mockLog).toHaveBeenCalledWith('hello workflow');
  });

  it('should support top-level await', async () => {
    const script = `
      const a = await Promise.resolve(10);
      return a * 2;
    `;
    const result = await WorkflowSandbox.execute(script, {});
    expect(result).toBe(20);
  });
});
