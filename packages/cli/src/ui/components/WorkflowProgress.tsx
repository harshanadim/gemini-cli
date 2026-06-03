/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import {
  useWorkflowProgress,
  type WorkflowState,
} from '../hooks/useWorkflowProgress.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { MessageBusType } from '@google/gemini-cli-core/src/confirmation-bus/types.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

interface RecursiveWorkflowProps {
  workflowId: string;
  state: WorkflowState;
  depth: number;
}

function RecursiveWorkflow({
  workflowId,
  state,
  depth,
}: RecursiveWorkflowProps) {
  const workflow = state.workflows[workflowId];
  if (!workflow) return null;

  return (
    <Box flexDirection="column" marginLeft={depth === 0 ? 0 : 2}>
      {workflow.phaseIds.map((phaseId, idx) => {
        const phase = state.phases[phaseId];
        if (!phase) return null;

        const isPhaseComplete =
          phase.agentIds.every(
            (aid) => state.agents[aid]?.status !== 'running',
          ) && phase.agentIds.length > 0;

        return (
          <Box key={idx} flexDirection="column" marginLeft={2}>
            <Text color={isPhaseComplete ? 'green' : 'yellow'} bold>
              {isPhaseComplete ? '✓' : '⟳'} {phase.title}
            </Text>

            {phase.logs.map((log, lIdx) => (
              <Box key={`log-${lIdx}`} marginLeft={2}>
                <Text dimColor>│ {log}</Text>
              </Box>
            ))}

            {phase.agentIds.map((agentId) => {
              const agent = state.agents[agentId];
              if (!agent) return null;

              return (
                <Box
                  key={`agent-${agent.id}`}
                  flexDirection="column"
                  marginLeft={2}
                >
                  <Box>
                    <Text
                      color={
                        agent.status === 'running'
                          ? 'yellow'
                          : agent.status === 'error'
                            ? 'red'
                            : 'green'
                      }
                    >
                      {agent.status === 'running' ? (
                        <Spinner type="dots" />
                      ) : agent.status === 'error' ? (
                        '✖'
                      ) : (
                        '✓'
                      )}{' '}
                    </Text>
                    <Text dimColor>
                      #{agent.displayId} {agent.label}
                    </Text>
                    {agent.error && <Text color="red"> ({agent.error})</Text>}
                  </Box>
                  {agent.childWorkflowId && (
                    <RecursiveWorkflow
                      workflowId={agent.childWorkflowId}
                      state={state}
                      depth={depth + 1}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

export function WorkflowProgress() {
  const config = useConfig();
  const { state } = useWorkflowProgress();
  const [isInteractive, setIsInteractive] = useState(false);

  // Determine if ANY workflow or agent is running globally
  const runningCount = Object.values(state.agents).filter(
    (a) => a.status === 'running',
  ).length;
  const isWorkflowRunning = !!(
    runningCount > 0 ||
    (state.rootWorkflowId &&
      state.workflows[state.rootWorkflowId]?.status === 'running')
  );

  // Toggle interaction mode
  useKeypress(
    (key: Key) => {
      // Toggle interaction mode via ctrl+w or ctrl+o
      if (key.ctrl && (key.name === 'w' || key.name === 'o')) {
        setIsInteractive((prev) => !prev);
        return true;
      }
      // If interactive, Esc exits interaction mode
      if (isInteractive && key.name === 'escape') {
        setIsInteractive(false);
        return true;
      }
      // Global abort via 'x'
      if (
        !isInteractive &&
        isWorkflowRunning &&
        (key.sequence === 'x' || key.sequence === 'X' || key.name === 'escape')
      ) {
        config.getMessageBus().emit(MessageBusType.WORKFLOW_CANCEL_REQUEST, {
          type: MessageBusType.WORKFLOW_CANCEL_REQUEST,
        });
        return true;
      }
      return false;
    },
    { isActive: isWorkflowRunning, priority: true },
  );

  // Auto-close interactive mode if workflow finishes
  if (!isWorkflowRunning && isInteractive) {
    setIsInteractive(false);
  }

  if (!state.isActive || !state.rootWorkflowId) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={
        isWorkflowRunning ? (isInteractive ? 'magenta' : 'yellow') : 'cyan'
      }
      paddingX={1}
    >
      <Box marginBottom={1} justifyContent="space-between">
        <Text
          color={
            isWorkflowRunning ? (isInteractive ? 'magenta' : 'yellow') : 'cyan'
          }
          bold
        >
          {isWorkflowRunning ? <Spinner type="dots" /> : '◆'} Dynamic Workflow{' '}
          {isWorkflowRunning ? 'Running...' : 'Complete'}
        </Text>
        {isWorkflowRunning && (
          <Text dimColor>
            {isInteractive
              ? 'Press <ESC> to return'
              : 'Press <x> to cancel or <Ctrl+O> to interact'}
          </Text>
        )}
      </Box>

      <RecursiveWorkflow
        workflowId={state.rootWorkflowId}
        state={state}
        depth={0}
      />

      {isInteractive && (
        <Box marginTop={1} marginLeft={2} flexDirection="column">
          <Text color="magenta" bold>
            Actions:
          </Text>
          <RadioButtonSelect
            items={[
              { key: 'cancel', label: 'Cancel Workflow', value: 'cancel' },
              { key: 'return', label: 'Return to Prompt', value: 'return' },
            ]}
            onSelect={(val) => {
              if (val === 'cancel') {
                config
                  .getMessageBus()
                  .emit(MessageBusType.WORKFLOW_CANCEL_REQUEST, {
                    type: MessageBusType.WORKFLOW_CANCEL_REQUEST,
                  });
              }
              setIsInteractive(false);
            }}
            isFocused={true}
            priority={true}
          />
        </Box>
      )}
    </Box>
  );
}
