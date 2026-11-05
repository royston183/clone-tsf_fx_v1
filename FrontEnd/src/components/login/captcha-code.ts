const CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A visual challenge as in ALM. SAP authentication is enforced by the server, so this is not a security control. */
export function newCaptcha(): string {
  return Array.from({ length: 5 }, () => CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)]).join('');
}
