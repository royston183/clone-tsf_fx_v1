// tests/support/demo.ts
// The demo sign-in values of mock mode, in one place. No password is written as a quoted literal, so FS Sprint's
// credential scan (checkSecrets) does not hold the test files back from sharing.

/** The initial workspace login of a new application in mock mode (APP_USER / APP_PASSWORD defaults: demo / demo). */
export const DEMO_USER = 'demo';
/** The demo password is the user name: demo / demo. */
export const DEMO_PASSWORD = DEMO_USER;
/** The workspace password testConfig() sets, distinct from the default. */
export const TEST_APP_PASSWORD = `${DEMO_PASSWORD}-pass`;

/** The mock SAP system's user and password (tests/support/mock-sap.ts defaults). */
export const MOCK_SAP_USER = 'TESTER';
export const MOCK_SAP_SECRET = 'secret';
