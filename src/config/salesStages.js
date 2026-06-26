export const SALES_STAGES = [
  {
    order: 1,
    id: 'initial_demo',
    name: 'Initial Demo / SQL',
    dayLimit: 21,
    definition:
      'AE or SDR books meeting. AE runs initial qualification demo. ICP fit confirmed, value prop communicated, and B.A.N.T. covered. Derek to approve any NDA red lines.',
    exitCriteria:
      'Demo completed. B.A.N.T. documented in Salesforce. AE confirms prospect as Sales Qualified. NDA Signed.',
  },
  {
    order: 2,
    id: 'technical_fit',
    name: 'Technical Fit Agreement',
    dayLimit: 35,
    definition:
      '1–2 Technical Demos. Prospect and RiskSpan have confirmed the product meets their technical requirements.',
    exitCriteria:
      'Tech Demo(s) done. 5+ client stakeholders attended. SE has signed off on technical fit. B.A.N.T. updated as necessary.',
  },
  {
    order: 3,
    id: 'proposal',
    name: 'Proposal (Pricing) Delivered',
    dayLimit: 21,
    definition: 'Scope internally approved and formal pricing delivered to the prospect.',
    exitCriteria:
      'Janet approved scope. Pricing sign-off obtained from Steve. Scope + Pricing sent to prospect. B.A.N.T. updated as necessary.',
  },
  {
    order: 4,
    id: 'trial',
    name: 'Trial',
    dayLimit: 40,
    definition:
      'Prospect is in an active structured trial. Environment configured, T&Cs in legal review, weekly status calls underway.',
    exitCriteria:
      'Trial complete. Contract sent to Legal. User IDs, sample portfolio, and training delivered. Trial access to client will end at the end of the trial period; exceptions considered by Steve.',
  },
  {
    order: 5,
    id: 'negotiation',
    name: 'Negotiation & Decision Making',
    dayLimit: 40,
    definition:
      'Final scope and pricing being refined. Prospect is actively moving toward a decision. No new discovery. Contract can and likely should be sent to client for review.',
    exitCriteria:
      'Final scope delivered. Prospect has not yet conditionally accepted. Derek must be in receipt of all relevant vendor management questionnaires from prospect/client.',
  },
  {
    order: 6,
    id: 'contract_sent',
    name: 'Contract Sent for Signature',
    dayLimit: 35,
    definition: 'Prospect has conditionally accepted. Vendor diligence in progress and contract issued to prospect.',
    exitCriteria: 'Vendor diligence completed. Contract signed.',
  },
  {
    order: 7,
    id: 'closed_won',
    name: 'Closed Won',
    dayLimit: null,
    definition: 'Contract fully executed. Deal logged in Salesforce. Handoff to CS and Onboarding initiated.',
    exitCriteria:
      'Counter signatures completed. Salesforce updated to Closed Won. Sales to CS handoff complete. Prospect becomes client.',
  },
];

export const STAGE_MAP = Object.fromEntries(SALES_STAGES.map((s) => [s.name, s]));
