import type { Lifecycle } from '../../shared/types';
import { classLabel, STATUS_LABELS } from '../labels';

export function StatusBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  return <span className={`status-badge st-${lifecycle}`}>{STATUS_LABELS[lifecycle]}</span>;
}

export function ClassBadge({ cls }: { cls: string }) {
  return <span className={`class-badge cls-${cls}`}>{classLabel(cls)}</span>;
}
