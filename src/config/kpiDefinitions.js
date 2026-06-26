export const KPI_CATEGORIES = {
  activity: { label: 'Activity', color: '#FFA91D', textColor: '#92400e' },
  pipeline: { label: 'Pipeline Growth', color: '#0C8EA3', textColor: '#ffffff' },
  dealProgression: { label: 'Deal Progression', color: '#16A34A', textColor: '#ffffff' },
  revenue: { label: 'Revenue', color: '#7C3AED', textColor: '#ffffff' },
};

export const KPI_DEFS = [
  {
    id: 'outbound_emails',
    label: 'Outbound Emails / Week',
    category: 'activity',
    format: 'number',
    description: "Tasks where Type = 'Email' or Subject contains 'outreach', divided by weeks elapsed this quarter",
  },
  {
    id: 'self_sourced_meetings',
    label: 'Self-Sourced Meetings / Month',
    category: 'activity',
    format: 'number',
    description: 'Events/Tasks with Type = Meeting where lead source is rep-originated, divided by months elapsed',
  },
  {
    id: 'new_pipeline',
    label: 'New Pipeline This Quarter',
    category: 'pipeline',
    format: 'currency',
    description: 'ARR of new Opportunities created by rep this quarter',
  },
  {
    id: 'active_pipeline',
    label: 'Active Pipeline Coverage',
    category: 'pipeline',
    format: 'currency',
    description: 'Total open pipeline value this quarter',
  },
  {
    id: 'avg_days_per_stage',
    label: 'Avg Days / Stage',
    category: 'dealProgression',
    format: 'number',
    description: 'Average days per stage across all open deals',
  },
  {
    id: 'trial_to_proposal',
    label: 'Trial → Proposal Rate',
    category: 'dealProgression',
    format: 'percent',
    description: 'Deals that progressed from Trial to Proposal or later',
  },
  {
    id: 'deals_at_technical_fit',
    label: 'Deals at Technical Fit',
    category: 'dealProgression',
    format: 'number',
    description: 'Open deals currently at Stage 2: Technical Fit Agreement',
  },
  {
    id: 'arr_closed_quarter',
    label: 'ARR Closed This Quarter',
    category: 'revenue',
    format: 'currency',
    description: 'Annual_Recurring_Revenue_ARR__c for Closed Won opps this quarter',
  },
  {
    id: 'arr_ytd',
    label: 'ARR Closed YTD',
    category: 'revenue',
    format: 'currency',
    description: 'Annual_Recurring_Revenue_ARR__c for all Closed Won opps year-to-date',
  },
  {
    id: 'win_loss_reason',
    label: 'Win/Loss Reason Logged',
    category: 'revenue',
    format: 'percent',
    description: '% of Closed Won/Lost opps with a reason field populated',
  },
];
