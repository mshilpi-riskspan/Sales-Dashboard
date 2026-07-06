import PipelineByStage from '../modules/pipeline/PipelineByStage';
import PipelineByMonth from '../modules/pipeline/PipelineByMonth';
import DealsAtRisk from '../modules/pipeline/DealsAtRisk';
import WinLossAnalysis from '../modules/winloss/WinLossAnalysis';
import CalendarPage from '../modules/calendar/CalendarPage';
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
    id: 'pipeline-month',
    label: 'Pipeline by Month',
    icon: 'CalendarIcon',
    component: PipelineByMonth,
    filters: ['salesperson'],
  },
  {
    id: 'deals-at-risk',
    label: 'Deals at Risk',
    icon: 'ExclamationTriangleIcon',
    component: DealsAtRisk,
    filters: ['salesperson'],
  },
  {
    id: 'winloss',
    label: 'Win / Loss',
    icon: 'TrophyIcon',
    component: WinLossAnalysis,
    filters: ['salesperson'],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: 'CalendarDaysIcon',
    component: CalendarPage,
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
