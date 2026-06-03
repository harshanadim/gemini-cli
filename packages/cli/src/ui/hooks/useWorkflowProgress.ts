/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useConfig } from '../contexts/ConfigContext.js';
import { MessageBusType } from '@google/gemini-cli-core/src/confirmation-bus/types.js';
import type { Message } from '@google/gemini-cli-core/src/confirmation-bus/types.js';

export interface WorkflowAgentTask {
  id: number;
  label: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
}

export interface WorkflowPhase {
  title: string;
  agents: WorkflowAgentTask[];
  logs: string[];
}

export interface WorkflowState {
  isActive: boolean;
  phases: WorkflowPhase[];
}

export function useWorkflowProgress() {
  const config = useConfig();
  const messageBus = useMemo(() => config.getMessageBus(), [config]);

  const [state, setState] = useState<WorkflowState>({
    isActive: false,
    phases: [],
  });

  // Unique counter for agents to display #1, #2, etc.
  const [, setAgentCounter] = useState(0);

  const reset = useCallback(() => {
    setState({ isActive: false, phases: [] });
    setAgentCounter(0);
  }, []);

  useEffect(() => {
    const handleMessage = (message: Message) => {
      setState((prev) => {
        const newState = { ...prev };

        // Auto-start workflow if we receive workflow events
        if (
          !newState.isActive &&
          (message.type === MessageBusType.WORKFLOW_PHASE ||
            message.type === MessageBusType.WORKFLOW_LOG ||
            message.type === MessageBusType.WORKFLOW_SPAWN_AGENT)
        ) {
          newState.isActive = true;
          if (newState.phases.length === 0) {
            newState.phases = [
              { title: 'Initialization', agents: [], logs: [] },
            ];
          }
        }

        const currentPhaseIdx = Math.max(0, newState.phases.length - 1);

        switch (message.type) {
          case MessageBusType.WORKFLOW_START:
            // Reset state
            newState.isActive = true;
            newState.phases = [
              { title: 'Initialization', agents: [], logs: [] },
            ];
            setAgentCounter(0);
            break;

          case MessageBusType.WORKFLOW_END:
            // Mark any remaining running agents as errored (aborted)
            newState.phases = newState.phases.map((phase) => ({
              ...phase,
              agents: phase.agents.map((agent) =>
                agent.status === 'running'
                  ? {
                      ...agent,
                      status: 'error',
                      error: 'Workflow ended abruptly',
                    }
                  : agent,
              ),
            }));
            break;

          case MessageBusType.WORKFLOW_PHASE:
            newState.phases = [
              ...newState.phases,
              { title: message.data.title, agents: [], logs: [] },
            ];
            break;

          case MessageBusType.WORKFLOW_LOG:
            if (newState.phases[currentPhaseIdx]) {
              const phase = { ...newState.phases[currentPhaseIdx] };
              phase.logs = [...phase.logs, message.data.message];
              newState.phases[currentPhaseIdx] = phase;
            }
            break;

          case MessageBusType.WORKFLOW_SPAWN_AGENT: {
            setAgentCounter((c) => {
              const newCount = c + 1;
              if (newState.phases[currentPhaseIdx]) {
                const phase = { ...newState.phases[currentPhaseIdx] };
                phase.agents = [
                  ...phase.agents,
                  {
                    id: newCount,
                    label: message.data.label ?? 'Subagent',
                    status: 'running',
                  },
                ];
                newState.phases[currentPhaseIdx] = phase;
              }
              return newCount;
            });
            break;
          }

          case MessageBusType.WORKFLOW_AGENT_END: {
            if (newState.phases[currentPhaseIdx]) {
              const phase = { ...newState.phases[currentPhaseIdx] };
              // Find the last running agent that matches this label (or just the last running agent if no label)
              // This is a naive heuristic because events don't have correlation IDs yet, but good enough for UI
              const agentIdx = [...phase.agents]
                .reverse()
                .findIndex(
                  (a) =>
                    a.status === 'running' &&
                    (message.data.label
                      ? a.label === message.data.label
                      : true),
                );

              if (agentIdx !== -1) {
                const actualIdx = phase.agents.length - 1 - agentIdx;
                phase.agents[actualIdx] = {
                  ...phase.agents[actualIdx],
                  status:
                    message.data.status === 'completed' ? 'completed' : 'error',
                  error: message.data.error,
                };
                newState.phases[currentPhaseIdx] = phase;
              }
            }
            break;
          }
          default:
            break;
        }
        return newState;
      });
    };

    messageBus.subscribe(MessageBusType.WORKFLOW_START, handleMessage);
    messageBus.subscribe(MessageBusType.WORKFLOW_END, handleMessage);
    messageBus.subscribe(MessageBusType.WORKFLOW_PHASE, handleMessage);
    messageBus.subscribe(MessageBusType.WORKFLOW_LOG, handleMessage);
    messageBus.subscribe(MessageBusType.WORKFLOW_SPAWN_AGENT, handleMessage);
    messageBus.subscribe(MessageBusType.WORKFLOW_AGENT_END, handleMessage);

    return () => {
      messageBus.unsubscribe(MessageBusType.WORKFLOW_START, handleMessage);
      messageBus.unsubscribe(MessageBusType.WORKFLOW_END, handleMessage);
      messageBus.unsubscribe(MessageBusType.WORKFLOW_PHASE, handleMessage);
      messageBus.unsubscribe(MessageBusType.WORKFLOW_LOG, handleMessage);
      messageBus.unsubscribe(
        MessageBusType.WORKFLOW_SPAWN_AGENT,
        handleMessage,
      );
      messageBus.unsubscribe(MessageBusType.WORKFLOW_AGENT_END, handleMessage);
    };
  }, [messageBus]);

  return { state, reset };
}
