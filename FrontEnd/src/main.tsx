import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
// ALM's stylesheets, in ALM's import order (src/main.jsx), so the cascade is identical.
import '@/styles/base.css';
import '@/styles/theme.css';
import '@/styles/login-base.css';
import '@/styles/login.css';
import '@/styles/login-theme.css';
import '@/styles/workbench.css';
// ALM pages import these after maintenance.css (ManualData, TrmRepayment, BudgetUpload, Overview); same order here.
import '@/styles/manualdata.css';
import '@/styles/trmrepay.css';
import '@/styles/tbdata.css';
import '@/styles/trmdeal.css';
import '@/styles/overview.css';
// Template additions, after every ALM file (spec §4).
import '@/styles/kit.css';
import '@/styles/report-template.css';
import '@/styles/dashboard-template.css';
import '@/styles/spacing-template.css';
import '@/styles/transaction-modal.css';
import '@/styles/normal/tokens.css';
import '@/styles/normal/shell.css';
import '@/styles/normal/login.css';
import '@/styles/normal/skin.css';
import '@/components/table/table.css';
import '@/styles/tsf-modal.css';
import '@/styles/catalog-refinement.css';
import { App } from './App';
import { Notice } from './components/ui/Notice';
import * as data from './lib/client/data';
import { applyAppTheme } from './lib/client/app-theme';
import { APP_THEME, startRuntime } from './runtime';

// A wrong SAP build setting (VITE_SAP_*) is shown once, here, instead of the application.
applyAppTheme(APP_THEME);
const problem = startRuntime();
// The application's data client, for the e2e tests and support: it can do nothing the page itself cannot.
(window as unknown as { __appData: typeof data }).__appData = data;
createRoot(document.getElementById('root')!).render(
  <StrictMode>{problem ? <main className="content"><Notice error>{problem}</Notice></main> : <App />}</StrictMode>
);
