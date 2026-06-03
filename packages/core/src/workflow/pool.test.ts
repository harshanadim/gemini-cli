/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { WorkflowTaskPool } from './pool.js';

describe('WorkflowTaskPool', () => {
  it('should execute tasks up to the concurrency limit', async () => {
    const pool = new WorkflowTaskPool(2);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      running++;
      if (running > maxRunning) maxRunning = running;
      await new Promise(resolve => setTimeout(resolve, 10));
      running--;
      return true;
    };

    const tasks = Array.from({ length: 5 }, () => pool.run(task));
    await Promise.all(tasks);

    expect(maxRunning).toBe(2);
  });

  it('should return task results correctly', async () => {
    const pool = new WorkflowTaskPool(1);
    const result = await pool.run(async () => 'success');
    expect(result).toBe('success');
  });

  it('should properly handle task failures and release slots', async () => {
    const pool = new WorkflowTaskPool(1);
    
    // First task fails
    await expect(pool.run(async () => {
      throw new Error('Task failed');
    })).rejects.toThrow('Task failed');

    // Second task should still be able to run
    const result = await pool.run(async () => 'success');
    expect(result).toBe('success');
  });
});
