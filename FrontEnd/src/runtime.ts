// How this FrontEnd runs. APP_TYPE and APP_THEME are set by scripts/new-application.ps1 (each on its own literal line):
//   'fullstack' (FE + BE + DB): the application's own data is the BackEnd's (its own port); SAP through the relay.
//   'frontend'  (Front end only): the application's own data is kept in this browser; SAP through the relay.
// APP_THEME: 'tiles' (tile catalogue and rail) or 'normal' (the LAS look, components/normal/); main.tsx applies it as data-app-theme.
// Either way the core runs in this page (src/lib/client/data.ts calls it) and the page never calls its own origin.
import { setPlatform } from '@core/platform';
import { browserPlatform } from '@/lib/client/browser-platform';
import { buildConfig, buildConfigError } from '@/lib/client/sap-account';

export const APP_TYPE = 'fullstack' as 'fullstack' | 'frontend';
export const APP_THEME = 'tiles' as 'tiles' | 'normal';

/** Sets the browser platform. Returns what is wrong with the build's SAP settings ('' when nothing is), for the page to show. */
export function startRuntime(): string {
  const error = buildConfigError();
  if (!error) setPlatform(browserPlatform(buildConfig(), APP_TYPE));
  return error;
}
