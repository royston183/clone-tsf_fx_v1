/** Brand and login texts. Change these to re-brand the workspace; every screen reads them from here. */
export const APP = {
  name: 'TSF FX',
  subtitle: 'FX Treasury Workspace',
  crumbRoot: 'TSF FX',
  workspaceLabel: 'TSF FX Workspace',
  workspaceNote: 'FX front, mid and back office',
  footerVersion: 'Workspace v0.1',
  logo: '/logo.png',
  login: {
    kicker: 'SAP S/4HANA TRM · FX Front, Mid & Back Office',
    headline: ['Structured Finance For', 'Food, Feed And Fibre.'],
    intro:
      'One workspace for TSF foreign exchange: master contracts, the FX blotter and Deal IDs, mid-office confirmation and invoicing, settlement and month-end MTM, on SAP TRM through the SAP relay with your own SAP account.',
    benefits: [
      ['Connected', 'Live SAP data via the relay'],
      ['Your Account', 'Your SAP user and roles'],
      ['Consistent', 'One design for every app']
    ],
    flowTitle: 'The Workspace Cycle',
    flow: [
      ['01', 'Sign In', 'To The Workspace'],
      ['02', 'Find', 'Applications & Folders'],
      ['03', 'Maintain', 'Validated Before Saving'],
      ['04', 'Save', 'To SAP Via The Relay']
    ],
    capabilities: [
      ['Data', ['Master Data Maintenance', 'Excel Paste & Bulk Edit', 'Search & Filters']],
      ['SAP', ['OData V4 RAP', 'CSRF & ETag Handling', 'Atomic Batch Saves']],
      ['Workspace', ['Light & Dark Themes', 'Your SAP Authorizations', 'Audit Stamps']]
    ]
  }
} as const;
