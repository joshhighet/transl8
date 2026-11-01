// The data files are fetched at startup. When that failed, app.js rendered a
// header, two dead buttons and nothing else -- the only trace was an uncaught
// promise rejection in the console. This pins the recovery behaviour.
//
// It lives in its own file because node gives each test file a fresh process,
// which is the only clean way to re-evaluate app.js with a different fetch.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

function makeElement(tag) {
  const node = {
    tagName: tag, children: [], attributes: {}, listeners: {},
    dataset: {}, style: {}, textContent: '', value: '', disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; },
    click() { for (const fn of this.listeners.click || []) fn({ target: this }); },
  };
  let html = '';
  Object.defineProperty(node, 'innerHTML', {
    get: () => html,
    set(v) { html = v; if (v === '') node.children.length = 0; },
  });
  Object.defineProperty(node, 'className', {
    get: () => node.attributes.class || '',
    set(v) { node.attributes.class = v; },
  });
  return node;
}

const ids = ['form-rows', 'results', 'add-btn', 'clear-btn'];
const dom = Object.fromEntries(ids.map(id => [id, makeElement('div')]));

function text(node) {
  return [node.textContent, node.innerHTML,
    ...(node.children || []).map(text)].join(' ');
}

before(async () => {
  globalThis.document = { getElementById: id => dom[id] ?? null, createElement: makeElement };
  globalThis.location = { search: '', pathname: '/' };
  globalThis.history = { replaceState() {} };
  globalThis.window = { open() {} };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
  // What a static host actually serves for a missing path: an HTML 404 page,
  // which is what made the old code throw "Unexpected token '<'".
  globalThis.fetch = async () => ({
    ok: false, status: 404,
    json: async () => { throw new SyntaxError("Unexpected token '<'"); },
  });

  await import('../app.js');
  await new Promise(r => setTimeout(r, 50));
});

describe('app.js survives a failed data load', () => {
  test('a visible error is rendered instead of a blank page', () => {
    const shown = text(dom['results']);
    assert.match(shown, /could not load/i, `results pane showed: ${shown}`);
  });

  test('the error names the file and status that failed', () => {
    assert.match(text(dom['results']), /queries\.json|providers\.json|countries\.json/);
    assert.match(text(dom['results']), /404/);
  });

  test('the error is announced to assistive tech', () => {
    const box = dom['results'].children.find(c => (c.attributes.class || '').includes('error-state'));
    assert.ok(box, 'no error-state element');
    assert.equal(box.attributes.role, 'alert');
  });

  test('the controls stay disabled rather than rendering an empty dropdown', () => {
    // Clicking "+ add" in this state used to produce a keyword <select> with
    // no options in it, because queryDefs was still [].
    assert.equal(dom['add-btn'].disabled, true, 'add-btn is still live');
    assert.equal(dom['clear-btn'].disabled, true, 'clear-btn is still live');
    dom['add-btn'].click();
    assert.equal(dom['form-rows'].children.length, 0,
      'a row was rendered with no keyword data to populate it');
  });
});
