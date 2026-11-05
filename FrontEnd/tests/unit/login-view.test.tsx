import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginView } from '@/components/login/LoginView';
import { Captcha } from '@/components/login/Captcha';
import { Notice } from '@/components/ui/Notice';
import { signedInUser } from '@/lib/client/app-login';
import { stubSessionStorage } from '../support/storage';

// The sign-in form as a component, without a DOM (the unit tests run in Node and the template adds no DOM library):
// React's useState is replaced by a small hook store, LoginView is called like React calls it, and the returned
// elements' own handlers (onChange, onSubmit) are invoked, then the component is rendered again with the new state.

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
const render = (): ReactElement => { h.at = 0; return LoginView({ footnote: 'Note', initialCaptcha: 'ABCDE' }) as ReactElement; };

/** Every element of the tree (components are not rendered: their props are what LoginView passes them). */
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
const type = (pred: (e: ReactElement<Props>) => boolean, value: string) => (find(pred).props.onChange as (e: unknown) => void)({ target: { value } });
const username = (e: ReactElement<Props>) => e.props.label === 'Username';
const password = (e: ReactElement<Props>) => e.type === 'input' && e.props.autoComplete === 'current-password';
const captchaInput = (e: ReactElement<Props>) => e.type === 'input' && e.props['aria-label'] === 'Captcha code';
const shownCaptcha = () => find(e => e.type === Captcha).props.code;
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

describe('LoginView', () => {
  it('a wrong user name or password says so, does not sign in, and shows a new captcha', () => {
    expect(notice()).toBeNull();
    submit('demo', 'wrong', 'abcde');
    expect(notice()).toBe('Incorrect user name or password.');
    expect(signedInUser()).toBeNull();
    expect(h.router.replace).not.toHaveBeenCalled();
    expect(shownCaptcha()).toBe('NEW01');
    expect(find(captchaInput).props.value).toBe('');
    expect(find(password).props.value).toBe('');
  });

  it('a wrong user name is refused the same way', () => {
    submit('someone', 'demo', 'ABCDE');
    expect(notice()).toBe('Incorrect user name or password.');
    expect(signedInUser()).toBeNull();
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  it('a wrong captcha is refused before the password is checked', () => {
    submit('demo', 'demo', 'XXXXX');
    expect(notice()).toBe('That captcha code does not match. Please try the new code.');
    expect(signedInUser()).toBeNull();
    expect(shownCaptcha()).toBe('NEW01');
  });

  it('the right user, password and captcha sign in and open the start page', () => {
    submit('DEMO', 'demo', 'abcde');
    expect(notice()).toBeNull();
    expect(signedInUser()).toBe('demo');
    expect(h.router.replace).toHaveBeenCalledWith('/');
  });
});
