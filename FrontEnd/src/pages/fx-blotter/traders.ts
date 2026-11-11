// The traders the blotter offers first, by the short names the desk knows them by, each resolved to the SAP trader code(s) that
// carry that person in the trader master (ZSGTRMTR_TRADER). The deals are always booked under the SAP code: no code is made up here,
// and a person with more than one SAP code is listed once per code so the right one can be chosen.

export interface TraderOption { code: string; text: string }
export interface Favourite { label: string; /** Matches the person's name in the trader master. */ match: RegExp }

export const FAVOURITE_TRADERS: readonly Favourite[] = [
  { label: 'Nidhi S', match: /^nidhi\b/i },
  { label: 'Aparna', match: /^aparna\b/i },
  { label: 'Lakshmi', match: /^lakshmi/i },
  { label: 'Sibte', match: /^sibte\b/i },
  { label: 'Rahul K', match: /^rahul k\b/i },
  { label: 'Amey T', match: /^amey\b/i },
  { label: 'Anil Jena', match: /^anil jena\b/i },
  { label: 'Mayank Jain', match: /^mayank jain\b/i }
];

/** The favourites that exist in the master, as { code, label } (label "Nidhi S" or, when several codes carry the person, "Nidhi S · C28"). */
export function favouriteOptions(all: readonly TraderOption[], favourites: readonly Favourite[] = FAVOURITE_TRADERS): { code: string; label: string }[] {
  const out: { code: string; label: string }[] = [];
  // The masters repeat a trader in every group he or she belongs to: one entry per code.
  const unique = [...new Map(all.map(t => [t.code, t])).values()];
  for (const f of favourites) {
    const hits = unique.filter(t => f.match.test(t.text.trim()));
    for (const t of hits) out.push({ code: t.code, label: hits.length > 1 ? `${f.label} · ${t.code}` : f.label });
  }
  return out;
}

/** Narrows a list to what the typed text appears in (code or name), ignoring case. */
export const matchesQuery = (q: string, ...parts: string[]): boolean => !q.trim() || parts.join(' ').toLowerCase().includes(q.trim().toLowerCase());
