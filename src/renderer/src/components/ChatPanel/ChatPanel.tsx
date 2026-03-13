import React from 'react';
import { useChatStore, type Phase } from '../../stores/chat.store';
import { MessageThread } from './MessageThread';
import { PromptInput } from './PromptInput';

const PHASES: Phase[] = ['imagine', 'warroom', 'build'];
const PHASE_ICONS: Record<Phase, string> = {
  imagine: '💡',
  warroom: '🗺️',
  build: '🔨',
};

export function ChatPanel() {
  const currentPhase = useChatStore((s) => s.currentPhase);
  const addUserMessage = useChatStore((s) => s.addUserMessage);

  const handleSubmit = async (prompt: string) => {
    addUserMessage(prompt);

    if ((window as any).office?.dispatch) {
      useChatStore.getState().setDispatching(true);
      try {
        await (window as any).office.dispatch(prompt);
      } finally {
        useChatStore.getState().setDispatching(false);
      }
    }
  };

  return (
    <div style={{
      width: 320,
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid #2a2a4a',
      background: '#0f0f1a',
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #2a2a4a' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {PHASES.map((phase) => (
            <span
              key={phase}
              style={{
                fontSize: 11,
                color: phase === currentPhase ? '#e5e5e5' : '#4a4a6a',
                fontWeight: phase === currentPhase ? 700 : 400,
              }}
            >
              {PHASE_ICONS[phase]} {phase}
            </span>
          ))}
        </div>
      </div>

      <MessageThread />
      <PromptInput onSubmit={handleSubmit} />
    </div>
  );
}