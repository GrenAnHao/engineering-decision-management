import type { Lifecycle } from '../../shared/types';
import type { KpiTarget, SortMode } from '../derive';

/** 视图内筛选状态。按项目隔离：切视图保留，切项目重置（由 Workspace 的 key 保证）。 */
export type Filters = {
  timelineMonth: string;
  timelineClass: string;
  altQuery: string;
  status: Lifecycle | '';
  cls: string;
  sort: SortMode;
};

export const INITIAL_FILTERS: Filters = {
  timelineMonth: '',
  timelineClass: '',
  altQuery: '',
  status: '',
  cls: '',
  sort: 'new',
};

export type FilterAction =
  | { type: 'set'; patch: Partial<Filters> }
  | { type: 'reset-timeline' }
  | { type: 'reset-directory' }
  | { type: 'jump'; target: KpiTarget };

export function filtersReducer(state: Filters, action: FilterAction): Filters {
  switch (action.type) {
    case 'set':
      return { ...state, ...action.patch };
    case 'reset-timeline':
      return { ...state, timelineMonth: '', timelineClass: '' };
    case 'reset-directory':
      return { ...state, status: '', cls: '' };
    case 'jump':
      return 'status' in action.target
        ? { ...state, status: action.target.status, cls: '' }
        : { ...state, status: '', cls: action.target.cls };
  }
}
