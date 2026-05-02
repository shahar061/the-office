import React, { useEffect } from 'react';
import { useSettingsStore, type SettingsSection } from '../../stores/settings.store';
import { useT, type StringKey } from '../../i18n';
import { GeneralSection } from './sections/GeneralSection';
import { WorkspaceSection } from './sections/WorkspaceSection';
import { AboutSection } from './sections/AboutSection';
import { AgentsSection } from './sections/AgentsSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { MobileSection } from './sections/MobileSection';
import { LanguageSection } from './sections/LanguageSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { colors } from '../../theme';

interface NavItem {
  id: SettingsSection;
  labelKey: StringKey;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'general', labelKey: 'settings.nav.general', icon: '⚙' },
  { id: 'language', labelKey: 'settings.nav.language', icon: '🌐' },
  { id: 'appearance', labelKey: 'settings.nav.appearance', icon: '🎨' },
  { id: 'agents', labelKey: 'settings.nav.agents', icon: '👥' },
  { id: 'workspace', labelKey: 'settings.nav.workspace', icon: '🗂' },
  { id: 'mobile', labelKey: 'settings.nav.mobile', icon: '📱' },
  { id: 'integrations', labelKey: 'settings.nav.integrations', icon: '🔌' },
  { id: 'about', labelKey: 'settings.nav.about', icon: 'ℹ' },
];

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  panel: {
    width: 900,
    height: 640,
    maxWidth: '95vw',
    maxHeight: '95vh',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: `1px solid ${colors.border}`,
  },
  title: {
    fontSize: '14px',
    fontWeight: 700 as const,
    color: colors.text,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '16px',
    padding: '0 4px',
    fontFamily: 'inherit',
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  sidebar: {
    width: 180,
    borderRight: `1px solid ${colors.border}`,
    padding: '12px 0',
    flexShrink: 0,
  },
  navItem: (active: boolean): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 16px',
    cursor: 'pointer',
    fontSize: '12px',
    color: active ? colors.text : colors.textMuted,
    background: active ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
    borderLeft: active ? `2px solid ${colors.accent}` : '2px solid transparent',
  }),
  content: {
    flex: 1,
    overflowY: 'auto' as const,
  },
} as const;

export function SettingsPanel() {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const activeSection = useSettingsStore((s) => s.activeSection);
  const setActiveSection = useSettingsStore((s) => s.setActiveSection);
  const close = useSettingsStore((s) => s.close);
  const t = useT();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div style={styles.backdrop} onClick={close}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>
            <span>⚙</span>
            <span>{t('app.menu.settings')}</span>
          </div>
          <button style={styles.closeBtn} onClick={close}>
            ✕
          </button>
        </div>

        <div style={styles.body}>
          <div style={styles.sidebar}>
            {NAV_ITEMS.map((item) => (
              <div
                key={item.id}
                style={styles.navItem(activeSection === item.id)}
                onClick={() => setActiveSection(item.id)}
              >
                <span>{item.icon}</span>
                <span>{t(item.labelKey)}</span>
              </div>
            ))}
          </div>

          <div style={styles.content}>
            {activeSection === 'general' && <GeneralSection />}
            {activeSection === 'language' && <LanguageSection />}
            {activeSection === 'appearance' && <AppearanceSection />}
            {activeSection === 'agents' && <AgentsSection />}
            {activeSection === 'workspace' && <WorkspaceSection />}
            {activeSection === 'mobile' && <MobileSection />}
            {activeSection === 'integrations' && <IntegrationsSection />}
            {activeSection === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
