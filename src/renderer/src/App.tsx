import React, { useEffect } from 'react';
import { useProjectStore } from '@/stores/project.store';
import { useChatStore } from '@/stores/chat.store';
import { useKanbanStore } from '@/stores/kanban.store';
import { useOfficeStore } from '@/stores/office.store';
import { useArtifactStore } from '@/stores/artifact.store';

const ProjectPicker = React.lazy(() => import('@/components/ProjectPicker/ProjectPicker'));
const OfficeView = React.lazy(() => import('@/components/OfficeView/OfficeView'));

export default function App() {
  const projectState = useProjectStore((s) => s.projectState);
  const setAuthStatus = useProjectStore((s) => s.setAuthStatus);
  const setProjectState = useProjectStore((s) => s.setProjectState);
  const setPhaseInfo = useProjectStore((s) => s.setPhaseInfo);
  const addMessage = useChatStore((s) => s.addMessage);
  const setKanban = useKanbanStore((s) => s.setKanban);
  const handleAgentEvent = useOfficeStore((s) => s.handleAgentEvent);
  const markArtifactAvailable = useArtifactStore((s) => s.markAvailable);
  const hydrateArtifacts = useArtifactStore((s) => s.hydrateFromStatus);

  useEffect(() => {
    const unsubs = [
      window.office.onAuthStatusChange(setAuthStatus),
      window.office.onPhaseChange(setPhaseInfo),
      window.office.onChatMessage(addMessage),
      window.office.onKanbanUpdate(setKanban),
      window.office.onAgentEvent(handleAgentEvent),
      window.office.onArtifactAvailable((payload) => markArtifactAvailable(payload.key)),
    ];
    window.office.getAuthStatus().then(setAuthStatus);
    window.office.getArtifactStatus().then(hydrateArtifacts);
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const view = projectState ? 'office' : 'picker';

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#0f0f1a', color: '#e5e5e5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <React.Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Loading...</div>}>
        {view === 'picker' ? (
          <ProjectPicker onProjectOpened={(state) => setProjectState(state)} />
        ) : (
          <OfficeView />
        )}
      </React.Suspense>
    </div>
  );
}
