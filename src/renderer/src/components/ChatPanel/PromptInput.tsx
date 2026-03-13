import React, { useState } from 'react';
import { useChatStore } from '../../stores/chat.store';

const QUICK_COMMANDS = ['/imagine', '/warroom', '/build'];

interface Props {
  onSubmit: (prompt: string) => void;
}

export function PromptInput({ onSubmit }: Props) {
  const [input, setInput] = useState('');
  const isDispatching = useChatStore((s) => s.isDispatching);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isDispatching) return;
    onSubmit(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={{ borderTop: '1px solid #2a2a4a', padding: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            onClick={() => { setInput(cmd + ' '); }}
            style={{
              background: '#2a2a4a',
              border: 'none',
              color: '#9ca3af',
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            {cmd}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a prompt..."
          disabled={isDispatching}
          rows={2}
          style={{
            flex: 1,
            background: '#1e1e36',
            border: '1px solid #2a2a4a',
            color: '#e5e5e5',
            borderRadius: 4,
            padding: 8,
            fontSize: 13,
            resize: 'none',
            fontFamily: 'monospace',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={isDispatching || !input.trim()}
          style={{
            background: isDispatching ? '#2a2a4a' : '#3b82f6',
            border: 'none',
            color: '#fff',
            padding: '0 16px',
            borderRadius: 4,
            cursor: isDispatching ? 'not-allowed' : 'pointer',
            fontSize: 13,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}