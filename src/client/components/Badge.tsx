import type { Lifecycle } from '../../shared/types';
import { classLabel, classTone, STATUS_LABELS, STATUS_TONES } from '../labels';
import { Badge } from '../ui/Badge';

export function StatusBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  return (
    <Badge tone={STATUS_TONES[lifecycle]}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[lifecycle]}
    </Badge>
  );
}

export function ClassBadge({ cls }: { cls: string }) {
  return (
    <Badge tone={classTone(cls)} className="max-w-full">
      <span className="truncate">{classLabel(cls)}</span>
    </Badge>
  );
}
