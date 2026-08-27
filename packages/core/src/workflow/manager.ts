/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export class GlobalWorkflowManager {
  private globalAgentInvocations = 0;

  constructor(private readonly maxGlobalAgents: number) {}

  /**
   * Executes a workflow task (spawning an agent).
   * Ensures the global limit is respected to prevent runaway token usage.
   *
   * Deadlock Prevention: We use unbounded concurrency here (no strict semaphore slots)
   * so that parent workflows can wait on child workflows without deadlocking the pool.
   * Rate limiting is handled by the underlying LLM client's exponential backoff.
   */
  async runAgentTask<T>(task: () => Promise<T>): Promise<T> {
    if (this.globalAgentInvocations >= this.maxGlobalAgents) {
      throw new Error(
        `Maximum workflow subagents limit (${this.maxGlobalAgents}) exceeded globally. Configure general.maxWorkflowSubagents to increase this limit.`,
      );
    }

    this.globalAgentInvocations++;

    return task();
  }

  getInvocations(): number {
    return this.globalAgentInvocations;
  }

  reset(): void {
    this.globalAgentInvocations = 0;
  }
}
