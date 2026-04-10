import type { Request, KanbanState, KanbanTask } from '@shared/types';

function mapStatus(s: Request['status']): KanbanTask['status'] {
  switch (s) {
    case 'queued': return 'queued';
    case 'in_progress': return 'active';
    case 'awaiting_review': return 'review';
    case 'done': return 'done';
    case 'failed': return 'failed';
    case 'cancelled': return 'queued';
  }
}

export function requestsToKanbanState(requests: Request[]): KanbanState {
  const tasks: KanbanTask[] = requests.map((r) => ({
    id: r.id,
    description: r.title || r.description.slice(0, 60),
    status: mapStatus(r.status),
    assignedAgent: r.assignedAgent ?? 'freelancer',
    phaseId: 'workshop',
    dependsOn: [],
    error: r.error ?? undefined,
  }));

  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const completionPercent = tasks.length
    ? Math.round((doneCount / tasks.length) * 100)
    : 0;

  return {
    projectName: '',
    currentPhase: 'workshop',
    completionPercent,
    tasks,
  };
}
