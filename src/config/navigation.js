import FirmGoals from '../modules/goals/FirmGoals';
import CurrentClientsPage from '../modules/clients/CurrentClientsPage';
import RenewalsPage from '../modules/renewals/RenewalsPage';
import TargetedProspects from '../modules/prospects/TargetedProspects';
import RaasPage from '../modules/raas/RaasPage';
import DaasPage from '../modules/daas/DaasPage';
import PipelineByStage from '../modules/pipeline/PipelineByStage';
import PipelineByMonth from '../modules/pipeline/PipelineByMonth';
import WinLossAnalysis from '../modules/winloss/WinLossAnalysis';
import ClosedWonByType from '../modules/winloss/ClosedWonByType';
import CalendarPage from '../modules/calendar/CalendarPage';
import RepKPIs from '../modules/repkpis/RepKPIs';
import CampaignsPage from '../modules/campaigns/CampaignsPage';
import AccountMapping from '../modules/settings/AccountMapping';

export const NAV_ITEMS = [
  {
    id: 'goals',
    label: 'Firm Goals',
    icon: 'FlagIcon',
    component: FirmGoals,
    filters: ['salesperson'],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: 'BuildingOffice2Icon',
    component: CurrentClientsPage,
    filters: ['salesperson'],
  },
  {
    id: 'renewals',
    label: 'Renewals & Churn',
    icon: 'ArrowPathIcon',
    component: RenewalsPage,
    filters: ['salesperson'],
  },
  {
    id: 'raas-ops',
    label: 'RaaS Ops',
    icon: 'ServerIcon',
    component: RaasPage,
    filters: [],
  },
  {
    id: 'daas-ops',
    label: 'DaaS Ops',
    icon: 'CircleStackIcon',
    component: DaasPage,
    filters: [],
  },
  {
    id: 'targeted-prospects',
    label: 'Targeted Prospects',
    icon: 'UserPlusIcon',
    component: TargetedProspects,
    filters: ['salesperson'],
  },
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
  {
    id: 'winloss',
    label: 'Win / Loss',
    icon: 'TrophyIcon',
    component: WinLossAnalysis,
    filters: ['salesperson'],
  },
  {
    id: 'closed-won',
    label: 'Closed Won',
    icon: 'CurrencyDollarIcon',
    component: ClosedWonByType,
    filters: ['salesperson'],
  },
  {
    id: 'account-mapping',
    label: 'Account Mapping',
    icon: 'ArrowsRightLeftIcon',
    component: AccountMapping,
    filters: [],
  },
];
