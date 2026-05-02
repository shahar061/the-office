import React, { useEffect } from 'react';
import { useProjectStore } from '@/stores/project.store';
import { useChatStore } from '@/stores/chat.store';
import { useKanbanStore } from '@/stores/kanban.store';
import { useOfficeStore } from '@/stores/office.store';
import { useArtifactStore } from '@/stores/artifact.store';
import { useWarTableStore } from './stores/war-table.store';
import { useUIDesignReviewStore } from './stores/ui-design-review.store';
import { useLogStore } from './stores/log.store';
import { useStatsStore } from './stores/stats.store';
import { useLayoutStore, setCurrentLayoutPhase } from './stores/layout.store';
import { findLeafByPanelId } from './components/SplitLayout/layout-utils';
import { useRequestStore } from './stores/request.store';
import { useRequestPlanReviewStore } from './stores/request-plan-review.store';
import { useGitInitModalStore } from './stores/git-init-modal.store';
import { useGitBannerStore } from './stores/git-banner.store';
import { useGreenfieldBannersStore } from './stores/greenfield-banners.store';
import { useSettingsStore } from './stores/settings.store';
import { useMobileBridgeStore } from './stores/mobile-bridge.store';
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel';
import { BugReportModal } from './components/BugReportModal';
import { AppChromeCluster } from './components/AppChromeCluster';
import { useWorkshopKanbanSync } from './hooks/useWorkshopKanbanSync';
import { audioManager } from './audio/AudioManager';

const ProjectPicker = React.lazy(() => import('@/components/ProjectPicker/ProjectPicker'));
const OfficeView = React.lazy(() => import('@/components/OfficeView/OfficeView'));

export default function App() {
  const projectState = useProjectStore((s) => s.projectState);
  const setAuthStatus = useProjectStore((s) => s.setAuthStatus);
  const setProjectState = useProjectStore((s) => s.setProjectState);
  const setPhaseInfo = useProjectStore((s) => s.setPhaseInfo);
  const addMessage = useChatStore((s) => s.addMessage);
  const setWaiting = useChatStore((s) => s.setWaiting);
  const setKanban = useKanbanStore((s) => s.setKanban);
  const handleAgentEvent = useOfficeStore((s) => s.handleAgentEvent);
  const markArtifactAvailable = useArtifactStore((s) => s.markAvailable);
  const hydrateArtifacts = useArtifactStore((s) => s.hydrateFromStatus);
  const setUIDesigns = useArtifactStore((s) => s.setUIDesigns);
  const setStats = useStatsStore((s) => s.setStats);
  const settings = useSettingsStore((s) => s.settings);

  useWorkshopKanbanSync();

  useEffect(() => {
    useSettingsStore.getState().hydrate();
  }, []);

  useEffect(() => {
    const language = settings?.language ?? 'en';
    document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [settings?.language]);

  // Apply the active appearance theme. The CSS custom properties cascade
  // down from <html data-theme="…">; switching themes is a single attribute
  // write with no React re-render.
  useEffect(() => {
    const theme = settings?.appearance?.theme ?? 'dark';
    document.documentElement.dataset.theme = theme;
  }, [settings?.appearance?.theme]);

  useEffect(() => {
    void useMobileBridgeStore.getState().refresh();
    // Apply the status payload directly from the push event — avoids a race
    // where multiple in-flight getStatus() calls resolve out of order and
    // a stale status (e.g. old pendingSas) overwrites the fresh one.
    const unsub = window.office.mobile.onStatusChange((status) => {
      useMobileBridgeStore.getState().applyStatus(status);
    });
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    const unsubs = [
      window.office.onAuthStatusChange(setAuthStatus),
      window.office.onPhaseChange(setPhaseInfo),
      window.office.onChatMessage(addMessage),
      window.office.onKanbanUpdate(setKanban),
      window.office.onAgentEvent(handleAgentEvent),
      window.office.onArtifactAvailable((payload) => {
        markArtifactAvailable(payload.key);
        audioManager.playSfx('artifact-written');
        if (payload.key === 'ui-designs') {
          window.office.listUIDesigns().then((d) => setUIDesigns(d.mockups));
        }
      }),
      window.office.onAgentWaiting((payload) => {
        audioManager.playSfx('agent-waiting');
        setWaiting(payload);
      }),
      window.office.onStatsState(setStats),
      window.office.onRequestUpdated((request) => {
        useRequestStore.getState().addOrUpdate(request);
      }),
      window.office.onRequestPlanReady((payload) => {
        useRequestPlanReviewStore.getState().openReview({
          requestId: payload.requestId,
          title: payload.title,
          plan: payload.plan,
        });
      }),
      window.office.onGitInitPrompt((payload) => {
        useGitInitModalStore.getState().openPrompt(payload.projectPath);
      }),
      window.office.onGitRecoveryNote((note) => {
        useGitBannerStore.getState().addBanner(note);
      }),
      window.office.onGreenfieldGitNote((note) => {
        // Append a transient status banner with a unique id so it doesn't replace others
        useGreenfieldBannersStore.getState().addBanner({
          id: `greenfield-git-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          level: note.level,
          message: note.message,
          key: note.key,
          vars: note.vars,
        });
      }),
      window.office.onProjectStateChanged((state) => {
        useProjectStore.getState().setProjectState(state);
      }),
      window.office.onSettingsUpdated((settings) => {
        useSettingsStore.getState().setFromEvent(settings);
      }),
      window.office.onOpenSettings(() => {
        useSettingsStore.getState().open();
      }),
    ];
    window.office.getAuthStatus().then(setAuthStatus);
    return () => unsubs.forEach((fn) => fn());
  }, []);

  // War Table IPC listeners
  useEffect(() => {
    const unsubs = [
      window.office.onWarTableState((state) => {
        useWarTableStore.getState().setVisualState(state);
      }),
      window.office.onWarTableCardAdded((card) => {
        useWarTableStore.getState().addCard(card);
      }),
      window.office.onWarTableReviewReady((payload) => {
        useWarTableStore.getState().setReviewContent(payload.content, payload.artifact);
      }),
      window.office.onUIDesignReviewReady((payload) => {
        useUIDesignReviewStore.getState().openReview(payload);
      }),
      window.office.onWarTableChoreography((payload) => {
        window.dispatchEvent(new CustomEvent('war-table-choreography', { detail: payload }));
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  // Cmd+, / Ctrl+, opens Settings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        useSettingsStore.getState().open();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Re-hydrate artifacts whenever a project is opened
  useEffect(() => {
    if (projectState) {
      window.office.getArtifactStatus().then(hydrateArtifacts);
      window.office.listUIDesigns().then((d) => setUIDesigns(d.mockups));
      window.office.getStatsState().then((s: any) => { if (s) setStats(s); });
    }
  }, [projectState?.path]);

  // Load layout for current phase
  useEffect(() => {
    if (!projectState) return;
    const phase = projectState.currentPhase;
    const mode = projectState.mode ?? 'greenfield';
    const layoutKey = mode === 'workshop' ? 'workshop' : phase;
    setCurrentLayoutPhase(layoutKey);

    window.office.getLayouts().then((saved: Record<string, unknown> | null) => {
      const candidate = saved?.[layoutKey];
      if (candidate) {
        useLayoutStore.getState().loadLayout(candidate as any);
        // Build phase shows the start-build intro inside the Kanban pane —
        // if the user's saved layout omits Kanban, the dialog has nowhere to
        // mount, so fall back to the default layout (which includes it).
        if (layoutKey === 'build') {
          const hasKanban = !!findLeafByPanelId(useLayoutStore.getState().tree, 'kanban');
          if (!hasKanban) useLayoutStore.getState().resetToDefault('build');
        }
      } else {
        useLayoutStore.getState().resetToDefault(layoutKey as any);
      }
    });
  }, [projectState?.path, projectState?.currentPhase, projectState?.mode]);

  // Load/reset requests when project changes
  useEffect(() => {
    if (!projectState) {
      useRequestStore.getState().reset();
      return;
    }
    useRequestStore.getState().load();
  }, [projectState?.path]);

  // Greenfield git setup banner — shown when user has no identity and imagine has completed
  useEffect(() => {
    if (!projectState || !settings) return;
    if (projectState.mode !== 'greenfield') return;

    if (useGreenfieldBannersStore.getState().isDismissedForProject(projectState.path)) {
      return;
    }

    if (!projectState.completedPhases.includes('imagine')) return;

    const hasIdentity =
      settings.gitIdentities.length > 0 &&
      settings.defaultGitIdentityId !== null;

    if (hasIdentity) {
      useGreenfieldBannersStore.getState().dismissBanner('greenfield-git-setup');
      return;
    }

    useGreenfieldBannersStore.getState().addBanner({
      id: 'greenfield-git-setup',
      level: 'info',
      message: 'Save your progress to git?',
      action: {
        label: 'Set up identity',
        onClick: () => useSettingsStore.getState().open('integrations'),
      },
    });
  }, [
    projectState?.mode,
    projectState?.currentPhase,
    projectState?.completedPhases,
    projectState?.path,
    settings?.gitIdentities,
    settings?.defaultGitIdentityId,
  ]);

  const view = projectState ? 'office' : 'picker';

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#0f0f1a', color: '#e5e5e5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <React.Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Loading...</div>}>
        {view === 'picker' ? (
          <ProjectPicker onProjectOpened={(state) => {
            useChatStore.getState().clearMessages();
            useOfficeStore.getState().reset();
            useArtifactStore.getState().reset();
            useWarTableStore.getState().reset();
            useKanbanStore.getState().reset();
            useLogStore.getState().reset();
            useStatsStore.getState().reset();
            useLayoutStore.getState().resetToDefault('idle');
            setProjectState(state);
            // Re-hydrate artifacts from disk (reset cleared them, effect may not re-fire for same path)
            window.office.getArtifactStatus().then(hydrateArtifacts);
            window.office.listUIDesigns().then((d) => setUIDesigns(d.mockups));
          }} />
        ) : (
          <OfficeView />
        )}
      </React.Suspense>
      <SettingsPanel />
      <BugReportModal />
      <AppChromeCluster />
    </div>
  );
}
