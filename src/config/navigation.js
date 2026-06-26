import PipelineByStage from '../modules/pipeline/PipelineByStage';
import RepKPIs from '../modules/repkpis/RepKPIs';

export const NAV_ITEMS = [
  {
    id: 'pipeline',
    label: 'Pipeline by Stage',
    icon: 'ChartBarIcon',
    component: PipelineByStage,
    filters: ['salesperson'],
  },
  {
    id: 'repkpis',
    label: 'Rep KPIs',
    icon: 'UserGroupIcon',
    component: RepKPIs,
    filters: ['salesperson'],
  },
  // To add a new module: { id, label, icon, component }
  // Omit `filters` if the module doesn't use the salesperson filter
];
