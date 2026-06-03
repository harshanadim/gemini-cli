/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useWorkflowProgress } from '../hooks/useWorkflowProgress.js';

export function WorkflowProgress() {
  const { state } = useWorkflowProgress();

  if (!state.isActive || state.phases.length === 0) {
    return null;
  }

  // Count active agents across all phases to determine overall status
  const runningCount = state.phases
    .flatMap((p) => p.agents)
    .filter((a) => a.status === 'running').length;
  const isWorkflowRunning = runningCount > 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          {isWorkflowRunning ? <Spinner type="dots" /> : '◆'} Dynamic Workflow{' '}
          {isWorkflowRunning ? 'Running...' : 'Complete'}
        </Text>
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
    </Box>
  );
}
