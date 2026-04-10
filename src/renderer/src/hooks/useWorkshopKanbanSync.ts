import { useEffect } from 'react';
import { useProjectStore } from '../stores/project.store';
import { useRequestStore } from '../stores/request.store';
import { useKanbanStore } from '../stores/kanban.store';
import { requestsToKanbanState } from '../components/WorkshopPanel/request-kanban-mapper';

/**
 * When in Workshop mode, pushes the current request list into the Kanban
 * store as a derived KanbanState. This lets the existing Kanban panel show
 * requests without any Kanban-side changes.
 */
export function useWorkshopKanbanSync() {
  const mode = useProjectStore((s) => s.projectState?.mode);
  const requests = useRequestStore((s) => s.requests);

  useEffect(() => {
    if (mode !== 'workshop') return;
    useKanbanStore.getState().setKanban(requestsToKanbanState(requests));
  }, [mode, requests]);
}
