// What GitHub and the Azure provisioner calls share about a network that fails: a request that never left this PC (no
// internet, no DNS, nothing listening) is safe to repeat whatever its method, so it waits for the connection to come back;
// a connection that dropped after sending is repeated only when the caller says a repeat is harmless.

/** Error codes of a request that never reached the server. */
const NOT_SENT = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN', 'UND_ERR_CONNECT_TIMEOUT']);

/** How long a call waits for the internet before it gives up. */
export const OFFLINE_WAIT = 10 * 60_000;

/** The code of a fetch failure (fetch hides it in error.cause), or ''. */
export const failureCode = error => String(error?.cause?.code || error?.code || '');

/** Whether the request never left this PC. */
export const notSent = error => NOT_SENT.has(failureCode(error));

/** "fetch failed" hides the reason (ECONNRESET, ETIMEDOUT, ENOTFOUND...) in error.cause. */
export function networkDetail(error) {
  const cause = error?.cause;
  const reason = cause ? [cause.code, cause.message].filter(Boolean).join(' ') : '';
  return reason ? `${error.message} (${reason})` : String(error?.message || error);
}

export const retryDelay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

/**
 * Waits while there is no internet: call `wait(error)` after each request that never left this PC. It sleeps with backoff
 * (2 s doubling to 30 s), says once that it is waiting, and returns false once `limit` has passed (the caller then fails).
 */
export function offlineWaiter({ limit = OFFLINE_WAIT, sleep = retryDelay, onOffline = message => process.stdout.write(`${message}\n`) } = {}) {
  let waited = 0, tries = 0;
  return async error => {
    if (waited >= limit) return false;
    if (tries === 0) onOffline(`No internet connection (${failureCode(error)}): waiting for it, up to ${Math.round(limit / 60_000)} minutes.`);
    const pause = Math.min(30_000, 2_000 * 2 ** tries, limit - waited);
    tries += 1;
    waited += pause;
    await sleep(pause);
    return true;
  };
}
