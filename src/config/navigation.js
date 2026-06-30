import PipelineByStage from '../modules/pipeline/PipelineByStage';
import RepKPIs from '../modules/repkpis/RepKPIs';
import CampaignsPage from '../modules/campaigns/CampaignsPage';

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
  {
    id: 'campaigns',
    label: 'Campaigns',
    icon: 'MegaphoneIcon',
    component: CampaignsPage,
    filters: [],
  },
];
