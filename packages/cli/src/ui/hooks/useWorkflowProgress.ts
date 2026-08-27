/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useConfig } from '../contexts/ConfigContext.js';
import { MessageBusType } from '@google/gemini-cli-core/src/confirmation-bus/types.js';
import type { Message } from '@google/gemini-cli-core/src/confirmation-bus/types.js';

export interface AgentTaskNode {
  id: string; // The workflowId_agentId or just agentId
  label: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
  childWorkflowId?: string; // If this agent spawned a sub-workflow
  displayId: number;
}

export interface PhaseNode {
  id: string;
  title: string;
  logs: string[];
  agentIds: string[];
}

export interface WorkflowInstanceNode {
  id: string;
  phaseIds: string[];
  status: 'running' | 'completed' | 'error';
}

export interface WorkflowState {
  isActive: boolean;
  rootWorkflowId?: string;
  workflows: Record<string, WorkflowInstanceNode>;
  phases: Record<string, PhaseNode>;
  agents: Record<string, AgentTaskNode>;
  agentCounter: number;
}

export function useWorkflowProgress() {
  const config = useConfig();
  const messageBus = useMemo(() => config.getMessageBus(), [config]);

  const [state, setState] = useState<WorkflowState>({
    isActive: false,
    workflows: {},
    phases: {},
    agents: {},
    agentCounter: 0,
  });

  const reset = useCallback(() => {
    setState({
      isActive: false,
      workflows: {},
      phases: {},
      agents: {},
      agentCounter: 0,
    });
  }, []);

  useEffect(() => {
    const handleMessage = (message: Message) => {
      setState((prev) => {
        const s = {
          ...prev,
          workflows: { ...prev.workflows },
          phases: { ...prev.phases },
          agents: { ...prev.agents },
        };

        const createPhaseIfNeeded = (wid: string) => {
          if (!s.workflows[wid]) return;
          if (s.workflows[wid].phaseIds.length === 0) {
            const phaseId = `phase_${Math.random()}`;
            s.phases[phaseId] = {
              id: phaseId,
              title: 'Initialization',
              logs: [],
              agentIds: [],
            };
            s.workflows[wid] = { ...s.workflows[wid], phaseIds: [phaseId] };
          }
        };

        switch (message.type) {
          case MessageBusType.WORKFLOW_START: {
            if (!message.parentId) {
              // This is a root workflow. Reset the entire state.
              s.isActive = true;
              s.rootWorkflowId = message.workflowId;
              s.workflows = {};
              s.phases = {};
              s.agents = {};
              s.agentCounter = 0;
            }
            s.workflows[message.workflowId] = {
              id: message.workflowId,
              phaseIds: [],
              status: 'running',
            };
            if (message.parentId && s.agents[message.parentId]) {
              s.agents[message.parentId] = {
                ...s.agents[message.parentId],
                childWorkflowId: message.workflowId,
              };
            }
            break;
          }

          case MessageBusType.WORKFLOW_END: {
            if (s.workflows[message.workflowId]) {
              s.workflows[message.workflowId] = {
                ...s.workflows[message.workflowId],
                status: 'completed',
              };

              // Mark any running agents in this workflow as errored
              const phaseIds = s.workflows[message.workflowId].phaseIds;
              for (const pid of phaseIds) {
                const phase = s.phases[pid];
                if (phase) {
                  for (const aid of phase.agentIds) {
                    if (s.agents[aid]?.status === 'running') {
                      s.agents[aid] = {
                        ...s.agents[aid],
                        status: 'error',
                        error: 'Workflow ended abruptly',
                      };
                    }
                  }
                }
              }
            }
            break;
          }

          case MessageBusType.WORKFLOW_PHASE: {
            if (message.workflowId && s.workflows[message.workflowId]) {
              const phaseId = `phase_${Math.random()}`;
              s.phases[phaseId] = {
                id: phaseId,
                title: message.data.title,
                logs: [],
                agentIds: [],
              };
              s.workflows[message.workflowId] = {
                ...s.workflows[message.workflowId],
                phaseIds: [
                  ...s.workflows[message.workflowId].phaseIds,
                  phaseId,
                ],
              };
            }
            break;
          }

          case MessageBusType.WORKFLOW_LOG: {
            if (message.workflowId && s.workflows[message.workflowId]) {
              createPhaseIfNeeded(message.workflowId);
              const pIds = s.workflows[message.workflowId].phaseIds;
              const lastPhaseId = pIds[pIds.length - 1];
              if (lastPhaseId) {
                s.phases[lastPhaseId] = {
                  ...s.phases[lastPhaseId],
                  logs: [...s.phases[lastPhaseId].logs, message.data.message],
                };
              }
            }
            break;
          }

          case MessageBusType.WORKFLOW_SPAWN_AGENT: {
            if (message.workflowId && s.workflows[message.workflowId]) {
              createPhaseIfNeeded(message.workflowId);
              const pIds = s.workflows[message.workflowId].phaseIds;
              const lastPhaseId = pIds[pIds.length - 1];

              if (lastPhaseId && message.data.agentId) {
                s.agentCounter += 1;
                const aid = message.data.agentId;
                s.agents[aid] = {
                  id: aid,
                  displayId: s.agentCounter,
                  label: message.data.label ?? 'Subagent',
                  status: 'running',
                };
                s.phases[lastPhaseId] = {
                  ...s.phases[lastPhaseId],
                  agentIds: [...s.phases[lastPhaseId].agentIds, aid],
                };
              }
            }
            break;
          }

          case MessageBusType.WORKFLOW_AGENT_END: {
            if (message.data.agentId && s.agents[message.data.agentId]) {
              s.agents[message.data.agentId] = {
                ...s.agents[message.data.agentId],
                status:
                  message.data.status === 'completed' ? 'completed' : 'error',
                error: message.data.error,
              };
            }
            break;
          }
          default:
            break;
        }
        return s;
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
