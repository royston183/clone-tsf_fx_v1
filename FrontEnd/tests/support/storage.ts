import { vi } from 'vitest';

/** A Storage stand-in for tests (the unit environment is Node), set as `name`. Returns the backing map. */
function stubStorage(name: 'sessionStorage' | 'localStorage'): Map<string, string> {
  const data = new Map<string, string>();
  vi.stubGlobal(name, {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, String(v)); },
    removeItem: (k: string) => { data.delete(k); },
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; }
  });
  return data;
}

/** A sessionStorage stand-in. Returns the backing map. */
export const stubSessionStorage = (): Map<string, string> => stubStorage('sessionStorage');
/** A localStorage stand-in. Returns the backing map. */
export const stubLocalStorage = (): Map<string, string> => stubStorage('localStorage');
