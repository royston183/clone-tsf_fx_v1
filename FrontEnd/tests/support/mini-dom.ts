// tests/support/mini-dom.ts
// The unit project runs in Node, without a DOM library. This is just enough of one for react-dom/client to mount a
// screen, run its effects and handle a click, so a test can follow what a click changes. It is not a browser:
// no layout, no CSS, no form controls. Use renderToStaticMarkup for markup checks and this only for interaction.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';

const HTML = 'http://www.w3.org/1999/xhtml';
type Listener = { fn: (e: unknown) => void; capture: boolean };

class FakeNode {
  parentNode: FakeElement | null = null;
  childNodes: FakeNode[] = [];
  listeners = new Map<string, Listener[]>();
  constructor(public nodeType: number, public nodeName: string, public ownerDocument: FakeDocument | null) {}
  get firstChild(): FakeNode | null { return this.childNodes[0] ?? null; }
  get lastChild(): FakeNode | null { return this.childNodes.at(-1) ?? null; }
  get nextSibling(): FakeNode | null { const s = this.parentNode?.childNodes; return s ? s[s.indexOf(this) + 1] ?? null : null; }
  get previousSibling(): FakeNode | null { const s = this.parentNode?.childNodes; return s ? s[s.indexOf(this) - 1] ?? null : null; }
  get textContent(): string { return this.childNodes.map(c => c.textContent).join(''); }
  set textContent(text: string) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    if (text) this.appendChild(new FakeText(text, this.ownerDocument));
  }
  appendChild<T extends FakeNode>(child: T): T { return this.insertBefore(child, null); }
  insertBefore<T extends FakeNode>(child: T, before: FakeNode | null): T {
    child.parentNode?.removeChild(child);
    const at = before ? this.childNodes.indexOf(before) : -1;
    if (at < 0) this.childNodes.push(child); else this.childNodes.splice(at, 0, child);
    child.parentNode = this as unknown as FakeElement;
    return child;
  }
  removeChild<T extends FakeNode>(child: T): T {
    this.childNodes = this.childNodes.filter(c => c !== child);
    child.parentNode = null;
    return child;
  }
  contains(other: FakeNode | null): boolean { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; }
  addEventListener(type: string, fn: (e: unknown) => void, options?: boolean | { capture?: boolean }) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), { fn, capture }]);
  }
  removeEventListener(type: string, fn: (e: unknown) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter(l => l.fn !== fn)); }
}

class FakeText extends FakeNode {
  constructor(public nodeValue: string, doc: FakeDocument | null) { super(3, '#text', doc); }
  get data() { return this.nodeValue; }
  override get textContent() { return this.nodeValue; }
  override set textContent(text: string) { this.nodeValue = text; }
}

export class FakeElement extends FakeNode {
  attributes = new Map<string, string>();
  style: Record<string, unknown> & { setProperty: (k: string, v: string) => void; removeProperty: (k: string) => void };
  dataset: Record<string, string> = {};
  constructor(public tagName: string, public namespaceURI: string, doc: FakeDocument | null) {
    super(1, tagName.toUpperCase(), doc);
    const style: Record<string, unknown> = {};
    this.style = Object.assign(style, { setProperty: (k: string, v: string) => { style[k] = v; }, removeProperty: (k: string) => { delete style[k]; } });
  }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  setAttributeNS(_ns: string | null, name: string, value: string) { this.setAttribute(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  removeAttributeNS(_ns: string | null, name: string) { this.removeAttribute(name); }
  get className() { return this.getAttribute('class') ?? ''; }
  get classList() { const names = this.className.split(/\s+/).filter(Boolean); return { contains: (c: string) => names.includes(c) }; }
  getElementById(id: string): FakeElement | null { return this.descendants().find(e => e.getAttribute('id') === id) ?? null; }
  // Only what a dialog's focus handling asks for: it falls back to the box itself.
  querySelector(): FakeElement | null { return null; }
  querySelectorAll(): FakeElement[] { return []; }
  /** A select's option elements (React reads them to set the selected value). */
  get options(): FakeElement[] { return this.descendants().filter(e => e.tagName.toLowerCase() === 'option'); }
  scrollIntoView() {}
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument) this.ownerDocument.activeElement = this.ownerDocument.body; }
  /** Every element below this one, in document order. */
  descendants(): FakeElement[] { return this.childNodes.flatMap(c => (c instanceof FakeElement ? [c, ...c.descendants()] : [])); }
}

export class FakeDocument extends FakeNode {
  documentElement: FakeElement;
  body: FakeElement;
  activeElement: FakeElement | null = null;
  defaultView: Record<string, unknown>;
  constructor() {
    super(9, '#document', null);
    this.documentElement = new FakeElement('html', HTML, this);
    this.body = new FakeElement('body', HTML, this);
    this.appendChild(this.documentElement).appendChild(this.body);
    this.defaultView = { document: this, HTMLIFrameElement: class {} };
  }
  getElementById(id: string): FakeElement | null { return this.body.getElementById(id); }
  createElement(tag: string) { return new FakeElement(tag, HTML, this); }
  createElementNS(ns: string, tag: string) { return new FakeElement(tag, ns, this); }
  createTextNode(text: string) { return new FakeText(text, this); }
}

/** A selector of one tag, classes and attributes, such as `button.nt-mobile-menu`, `.nt-topbar` or `div[role=dialog]`. */
function matches(el: FakeElement, selector: string): boolean {
  const attributes = [...selector.matchAll(/\[([\w-]+)(?:=([^\]]*))?\]/g)];
  const [tag, ...classes] = selector.replace(/\[[^\]]*\]/g, '').split('.');
  return (!tag || el.tagName === tag) && classes.every(c => el.classList.contains(c))
    && attributes.every(a => (a[2] === undefined ? el.hasAttribute(a[1]) : el.getAttribute(a[1]) === a[2]));
}

export interface MiniDom {
  /** Renders inside act(): effects have run when it returns. */
  render: (node: ReactNode) => void;
  /** The first element matching a simple `tag.class.class` selector; throws when there is none. */
  find: (selector: string) => FakeElement;
  findAll: (selector: string) => FakeElement[];
  /** A key pressed on the document (listeners on document see it, as the browser delivers it). */
  press: (key: string, modifiers?: { ctrl?: boolean }) => void;
  /** The page's own history entry index and state, and history.back() as the browser does it (popstate included). */
  history: { back: () => void; readonly state: unknown };
  /** A left click as the browser sends it, delivered through React's root listeners. */
  click: (el: FakeElement) => void;
  document: FakeDocument;
  unmount: () => void;
}

/**
 * Installs the fake document, window, location and history as globals (undo with vi.unstubAllGlobals) and returns a
 * root to render into. `pathname` is the page's address; Link and router.push change it through history.
 */
export function miniDom(pathname = '/'): MiniDom {
  const document = new FakeDocument();
  const events = new EventTarget();
  const url = new URL(pathname, 'http://localhost');
  const location = { get pathname() { return url.pathname; }, get search() { return url.search; }, get href() { return url.href; }, origin: url.origin, assign: () => {} };
  // Entries of the session history: Back moves to the one before and fires popstate; pushState and replaceState fire
  // app:navigated, as the app's own wrapper does (src/lib/client/nav.tsx), which the fake history has not been through.
  const entries: { state: unknown; href: string }[] = [{ state: null, href: url.href }];
  let index = 0;
  const show = (href: string) => { const next = new URL(href, url); url.pathname = next.pathname; url.search = next.search; };
  const history = {
    get state() { return entries[index].state; },
    pushState: (state: unknown, _t: string, to: string) => { show(to); entries.splice(index + 1, entries.length, { state, href: url.href }); index++; events.dispatchEvent(new Event('app:navigated')); },
    replaceState: (state: unknown, _t: string, to: string) => { show(to); entries[index] = { state, href: url.href }; events.dispatchEvent(new Event('app:navigated')); },
    go: (delta: number) => { const to = Math.max(0, Math.min(entries.length - 1, index + delta)); if (to === index) return; index = to; show(entries[index].href); events.dispatchEvent(new Event('popstate')); },
    back: () => history.go(-1)
  };
  const win = document.defaultView;
  Object.assign(win, { event: undefined, location, history });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('document', document);
  vi.stubGlobal('window', win);
  vi.stubGlobal('location', location);
  vi.stubGlobal('history', history);
  vi.stubGlobal('scrollTo', () => {});
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
  vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
  vi.stubGlobal('dispatchEvent', events.dispatchEvent.bind(events));
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  // Dialogs are portalled into the body, so search all of it.
  const all = () => document.body.descendants();
  return {
    document,
    render(node) { act(() => { root ??= createRoot(container as unknown as HTMLElement); root.render(node); }); },
    findAll: selector => all().filter(el => matches(el, selector)),
    find(selector) {
      const el = all().find(e => matches(e, selector));
      if (!el) throw new Error(`No element matches ${selector}`);
      return el;
    },
    history,
    press(key, modifiers = {}) {
      const event = { type: 'keydown', key, ctrlKey: Boolean(modifiers.ctrl), metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      act(() => { for (const l of [...(document.listeners.get('keydown') ?? [])]) l.fn(event); });
    },
    click(el) {
      let stopped = false;
      const event = {
        type: 'click', target: el, srcElement: el, bubbles: true, cancelable: true, defaultPrevented: false, isTrusted: true, timeStamp: Date.now(),
        button: 0, buttons: 0, detail: 1, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, clientX: 0, clientY: 0, screenX: 0, screenY: 0,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { stopped = true; }
      };
      act(() => {
        // React listens on its root (and on a portal's container): capture listeners from the top down, then bubbling ones from the target up.
        const path: FakeNode[] = [];
        for (let n: FakeNode | null = el; n; n = n.parentNode) path.push(n);
        for (const capture of [true, false]) {
          for (const n of capture ? [...path].reverse() : path) {
            if (stopped) break;
            for (const l of n.listeners.get('click') ?? []) if (l.capture === capture) l.fn(event);
          }
        }
      });
    },
    unmount() { act(() => root?.unmount()); root = null; }
  };
}
