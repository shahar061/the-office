import type React from 'react';

interface Props {
  active: 'office' | 'chat';
  onChange: (tab: 'office' | 'chat') => void;
}

export function TabBar({ active, onChange }: Props): React.JSX.Element {
  return (
    <div className="tab-bar">
      <button
        type="button"
        className={active === 'office' ? 'active' : ''}
        onClick={() => onChange('office')}
      >
        Office
      </button>
      <button
        type="button"
        className={active === 'chat' ? 'active' : ''}
        onClick={() => onChange('chat')}
      >
        Chat
      </button>
    </div>
  );
}
