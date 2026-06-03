/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useWorkflowProgress } from '../hooks/useWorkflowProgress.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { MessageBusType } from '@google/gemini-cli-core/src/confirmation-bus/types.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

export function WorkflowProgress() {
  const config = useConfig();
  const { state } = useWorkflowProgress();
  const [isInteractive, setIsInteractive] = useState(false);

  // Count active agents across all phases to determine overall status
  const runningCount = state.phases
    .flatMap((p) => p.agents)
    .filter((a) => a.status === 'running').length;
  const isWorkflowRunning = runningCount > 0;

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
      return false;
    },
    { isActive: isWorkflowRunning, priority: true },
  );

  // Auto-close interactive mode if workflow finishes
  if (!isWorkflowRunning && isInteractive) {
    setIsInteractive(false);
  }

  if (!state.isActive || state.phases.length === 0) {
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
              : 'Press <Ctrl+O> to interact'}
          </Text>
        )}
      </Box>

      {state.phases.map((phase, idx) => {
        const isPhaseComplete =
          phase.agents.every((a) => a.status !== 'running') &&
          phase.agents.length > 0;

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

            {phase.agents.map((agent) => (
              <Box key={`agent-${agent.id}`} marginLeft={2}>
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
                  #{agent.id} {agent.label}
                </Text>
                {agent.error && <Text color="red"> ({agent.error})</Text>}
              </Box>
            ))}
          </Box>
        );
      })}

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
