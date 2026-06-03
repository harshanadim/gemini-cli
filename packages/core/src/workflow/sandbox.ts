/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vm from 'node:vm';

export interface WorkflowSandboxOptions {
  timeoutMs?: number;
}

export class WorkflowSandbox {
  /**
   * Executes the given script in a strictly isolated environment.
   * 
   * @param script The JavaScript code to execute.
   * @param injectedGlobals An object whose properties will be available as globals in the script.
   * @param options Execution options (e.g., timeout).
   * @returns The result of the script execution (if it returns a value).
   */
  static async execute(
    script: string,
    injectedGlobals: Record<string, any>,
    options: WorkflowSandboxOptions = {}
  ): Promise<any> {
    const timeout = options.timeoutMs ?? 10 * 60 * 1000; // Default 10 minutes

    // Create a deeply restricted context object
    const sandboxContext = {
      // Inject the provided SDK globals
      ...injectedGlobals,
      
      // Provide basic JS primitives that are safe
      Promise,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Map,
      Set,
      JSON,
      Error,
      
      // Override non-deterministic or potentially unsafe globals
      Date: {
        now: () => { throw new Error("Date.now() is disabled in dynamic workflows for determinism."); }
      },
      Math: {
        ...Math,
        random: () => { throw new Error("Math.random() is disabled in dynamic workflows for determinism."); }
      },
      console: {
        log: (...args: any[]) => {
          // If a log function was injected via SDK, use it, otherwise ignore
          if (typeof injectedGlobals['log'] === 'function') {
            injectedGlobals['log'](args.join(' '));
          }
        },
        error: (...args: any[]) => {
           if (typeof injectedGlobals['log'] === 'function') {
            injectedGlobals['log']('[ERROR] ' + args.join(' '));
          }
        }
      }
    };

    const context = vm.createContext(sandboxContext);

    // Ensure the script is wrapped to allow top-level return/await if needed
    const wrappedScript = `
      (async () => {
        ${script}
      })();
    `;

    try {
      const result = await vm.runInContext(wrappedScript, context, {
        timeout,
        displayErrors: true,
      });
      return result;
    } catch (error) {
      throw new Error(`Workflow script execution failed: ${error}`);
    }
  }
}
