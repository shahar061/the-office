import { useProjectStore } from '../../stores/project.store';
import { HeaderStatusPill } from '../HeaderStatusPill/HeaderStatusPill';
import { AuthChip } from './AuthChip';

export function StatusSlot() {
  const projectState = useProjectStore((s) => s.projectState);
  if (projectState === null) return <AuthChip />;
  return <HeaderStatusPill />;
}
