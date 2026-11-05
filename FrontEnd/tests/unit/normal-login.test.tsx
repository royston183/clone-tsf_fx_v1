import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NormalLoginView } from '@/components/normal/NormalLoginView';
import { Captcha } from '@/components/login/Captcha';
import { Notice } from '@/components/ui/Notice';
import { APP } from '@/config/app.config';
import { signedInUser } from '@/lib/client/app-login';
import { stubSessionStorage } from '../support/storage';

// Same approach as login-view.test.tsx: useState is a small hook store, the view is called like React calls it and
// the returned elements' own handlers are invoked.

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  at: 0,
  router: { replace: (() => {}) as (path: string) => void, refresh: () => {} },
  captchas: [] as string[]
}));

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  const useState = (initial: unknown) => {
    const i = h.at++;
    if (!(i in h.states)) h.states[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    const set = (value: unknown) => { h.states[i] = typeof value === 'function' ? (value as (v: unknown) => unknown)(h.states[i]) : value; };
    return [h.states[i], set];
  };
  return { ...actual, useState };
});
vi.mock('@/lib/client/nav', () => ({ useRouter: () => h.router }));
vi.mock('@/lib/client/theme', () => ({ useTheme: () => ['light', () => {}] }));
vi.mock('@/components/login/captcha-code', () => ({ newCaptcha: () => h.captchas.shift() ?? 'ZZZZZ' }));

type Props = Record<string, unknown> & { children?: ReactNode };
const render = (): ReactElement<Props> => { h.at = 0; return NormalLoginView({ footnote: 'Note', initialCaptcha: 'ABCDE' }) as ReactElement<Props>; };

function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
const find = (pred: (e: ReactElement<Props>) => boolean): ReactElement<Props> => {
  const hit = elements(render()).find(pred);
  if (!hit) throw new Error('element not found');
  return hit;
};
const tagged = (tag: string, cls: string) => (e: ReactElement<Props>) => e.type === tag && String(e.props.className).split(' ').includes(cls);
const type = (pred: (e: ReactElement<Props>) => boolean, value: string) => (find(pred).props.onChange as (e: unknown) => void)({ target: { value } });
const username = (e: ReactElement<Props>) => e.type === 'input' && e.props.autoComplete === 'username';
const password = (e: ReactElement<Props>) => e.type === 'input' && e.props.autoComplete === 'current-password';
const captchaInput = (e: ReactElement<Props>) => e.type === 'input' && e.props['aria-label'] === 'Captcha code';
const notice = (): string | null => {
  const hit = elements(render()).find(e => e.type === Notice);
  return hit ? String(hit.props.children) : null;
};

function submit(user: string, pass: string, code: string): void {
  type(username, user);
  type(password, pass);
  type(captchaInput, code);
  (find(e => e.type === 'form').props.onSubmit as (e: unknown) => void)({ preventDefault: () => {} });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubSessionStorage();
  h.states = [];
  h.captchas = ['NEW01', 'NEW02'];
  h.router.replace = vi.fn();
  h.router.refresh = vi.fn();
});

describe('NormalLoginView', () => {
  it('has the LAS page structure with the app name in the pitch', () => {
    const main = render();
    expect(main.type).toBe('main');
    expect(main.props.className).toBe('nt-login');
    const sections = elements(main.props.children).filter(e => e.type === 'section');
    expect(sections.map(s => s.props.className)).toEqual(['nt-login-pitch', 'nt-login-panel']);
    const text = (n: ReactNode): string => Array.isArray(n) ? n.map(text).join('') : isValidElement<Props>(n) ? text(n.props.children) : typeof n === 'string' ? n : '';
    expect(text(sections[0])).toContain(APP.name);
    expect(elements(sections[1]).some(tagged('form', 'nt-login-card'))).toBe(true);
  });

  it('has no demo or role buttons', () => {
    const labels = elements(render()).filter(e => e.type === 'button').map(e => String(e.props['aria-label'] ?? e.props.title ?? '') + String(e.props.children));
    expect(labels.some(l => /demo|maker|checker/i.test(l))).toBe(false);
  });

  it('a wrong captcha is refused before the password is checked and shows a new one', () => {
    submit('demo', 'demo', 'XXXXX');
    expect(notice()).toBe('That captcha code does not match. Please try the new code.');
    expect(signedInUser()).toBeNull();
    expect(h.router.replace).not.toHaveBeenCalled();
    expect(find(e => e.type === Captcha).props.code).toBe('NEW01');
  });

  it('a wrong password shows the error text and does not sign in', () => {
    expect(notice()).toBeNull();
    submit('demo', 'wrong', 'abcde');
    expect(notice()).toBe('Incorrect user name or password.');
    expect(signedInUser()).toBeNull();
    expect(find(password).props.value).toBe('');
  });

  it('the right user, password and captcha sign in and open the start page', () => {
    submit('DEMO', 'demo', 'abcde');
    expect(notice()).toBeNull();
    expect(signedInUser()).toBe('demo');
    expect(h.router.replace).toHaveBeenCalledWith('/');
  });
});
