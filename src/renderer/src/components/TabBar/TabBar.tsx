import type { CSSProperties } from 'react';
import type { AppTab } from '../../stores/ui.store';

interface TabBarProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const TABS: { id: AppTab; label: string }[] = [
  { id: 'chat', label: 'CHAT' },
  { id: 'office', label: 'OFFICE' },
  { id: 'agents', label: 'AGENTS' },
];

const styles = {
  wrapper: {
    position: 'absolute' as const,
    top: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
  },
  container: {
    display: 'flex',
    background: '#1a1a2e',
    border: '1px solid #333',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  tab: (active: boolean): CSSProperties => ({
    padding: '8px 20px',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.05em',
    background: active ? '#2a2a4a' : 'transparent',
    color: active ? '#e5e5e5' : '#666',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s, color 0.15s',
  }),
};

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            style={styles.tab(tab.id === activeTab)}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
