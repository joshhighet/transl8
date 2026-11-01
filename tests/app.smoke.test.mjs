// Smoke test for app.js against a minimal DOM stub. app.js is the only file
// that touches the DOM, and converting it to an ES module is easy to get wrong
// in ways no query-generation test would notice, so this exercises bootstrap,
// rendering and the add/clear/delete handlers end to end.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');

function makeElement(tag) {
  const node = {
    tagName: tag, children: [], attributes: {}, listeners: {},
    dataset: {}, style: {}, textContent: '', value: '', disabled: false,
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
    setAttribute(k, v) { this.attributes[k] = v; },
    click() { for (const fn of this.listeners.click || []) fn({ target: this }); },
    change(value) { for (const fn of this.listeners.change || []) fn({ target: { value } }); },
    input(value) { for (const fn of this.listeners.input || []) fn({ target: { value } }); },
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

let replaceStateCalls = 0;

const ids = ['form-rows', 'results', 'add-btn', 'clear-btn'];
const dom = Object.fromEntries(ids.map(id => [id, makeElement('div')]));

// Walk the rendered tree looking for nodes by class, so assertions can talk
// about rows and cards rather than DOM internals.
function findAll(node, cls, acc = []) {
  for (const c of node.children || []) {
    if ((c.attributes?.class || '').split(/\s+/).includes(cls)) acc.push(c);
    findAll(c, cls, acc);
  }
  return acc;
}

before(async () => {
  globalThis.document = {
    getElementById: id => dom[id] ?? null,
    createElement: makeElement,
  };
  globalThis.location = { search: '', pathname: '/' };
  globalThis.history = { replaceState() { replaceStateCalls++; } };
  // navigator is a getter-only global in node, so it needs defineProperty
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async () => {} } }, configurable: true,
  });
  globalThis.window = { open() {} };
  globalThis.fetch = async url => {
    const file = path.join(ROOT, String(url));
    if (!fs.existsSync(file)) throw new Error(`app.js fetched a missing file: ${url}`);
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
  };

  await import('../app.js');
  // init() is async and not exported; give its three fetches a tick to settle.
  await new Promise(r => setTimeout(r, 50));
});

describe('app.js bootstrap', () => {
  test('renders one form row per default query term', () => {
    assert.equal(findAll(dom['form-rows'], 'query-row').length, 3);
  });

  test('renders a provider card per result and no empty state', () => {
    const cards = findAll(dom['results'], 'provider-card');
    assert.ok(cards.length >= 10, `only ${cards.length} cards rendered`);
    assert.doesNotMatch(dom['results'].innerHTML, /empty-state/);
  });

  test('the first row gets a spacer, later rows get an operator select', () => {
    const rows = findAll(dom['form-rows'], 'query-row');
    assert.equal(findAll(rows[0], 'op-spacer').length, 1);
    assert.equal(findAll(rows[0], 'op-select').length, 0);
    assert.equal(findAll(rows[1], 'op-select').length, 1);
  });

  test('the country row renders a select, not a free-text input', () => {
    const rows = findAll(dom['form-rows'], 'query-row');
    assert.equal(findAll(rows[2], 'country-select').length, 1);
    assert.equal(findAll(rows[2], 'value-input').length, 0);
  });

  test('available cards expose copy and open controls', () => {
    const ok = findAll(dom['results'], 'provider-card')
      .filter(c => !(c.attributes.class || '').includes('unavailable'));
    assert.ok(ok.length, 'no available providers');
    for (const card of ok) {
      assert.equal(findAll(card, 'btn-copy').length, 1);
      assert.equal(findAll(card, 'card-actions').length, 1);
    }
  });
});

describe('app.js controls', () => {
  test('add-btn appends a row', () => {
    const before = findAll(dom['form-rows'], 'query-row').length;
    dom['add-btn'].click();
    assert.equal(findAll(dom['form-rows'], 'query-row').length, before + 1);
  });

  test('deleting the first row does not leave a dangling operator', () => {
    const rows = findAll(dom['form-rows'], 'query-row');
    findAll(rows[0], 'btn-icon')[0].click();
    const text = findAll(dom['results'], 'query-output')
      .map(n => n.textContent).filter(Boolean);
    assert.ok(text.length, 'no query output after deleting a row');
    for (const q of text) {
      if (q.startsWith('unsupported:')) continue;
      assert.doesNotMatch(q, /^(and|or|AND|OR|&&|\|\||\+)\b/, `dangling operator: ${q}`);
    }
  });

  test('clear-btn collapses back to a single empty row', () => {
    dom['clear-btn'].click();
    assert.equal(findAll(dom['form-rows'], 'query-row').length, 1);
    assert.match(dom['results'].innerHTML, /empty-state/);
  });

  test('typing a value re-renders results', () => {
    const row = findAll(dom['form-rows'], 'query-row')[0];
    findAll(row, 'value-input')[0].input('8.8.8.8');
    const text = findAll(dom['results'], 'query-output').map(n => n.textContent);
    assert.ok(text.some(q => q.includes('8.8.8.8')), 'typed value never reached a query');
  });
});

describe('app.js ui fixes', () => {
  test('the keyword tooltip hangs off a wrapper, not the <select>', () => {
    // Browsers do not paint ::before/::after on a <select>, so a has-tip
    // class there rendered nothing at all. It belongs on the wrapping span.
    const row = findAll(dom['form-rows'], 'query-row')[0];
    const wrap = findAll(row, 'kw-wrap')[0];
    assert.ok(wrap, 'no kw-wrap element');
    assert.match(wrap.attributes.class, /has-tip/);
    assert.ok(wrap.attributes['data-tip'], 'wrapper carries no description');

    const sel = findAll(wrap, 'kw-select')[0];
    assert.ok(sel, 'no kw-select inside the wrapper');
    assert.doesNotMatch(sel.attributes.class || '', /has-tip/,
      'has-tip is back on the select, where it will not render');
  });

  test('every form control has an accessible name', () => {
    for (const cls of ['kw-select', 'value-input', 'op-select']) {
      for (const node of findAll(dom['form-rows'], cls)) {
        assert.ok(node.attributes['aria-label'],
          `${cls} has no aria-label`);
      }
    }
  });

  test('icon-only buttons have an accessible name', () => {
    for (const btn of findAll(dom['form-rows'], 'btn-icon')) {
      assert.ok(btn.attributes['aria-label'], 'remove button has no aria-label');
    }
    for (const btn of findAll(dom['results'], 'btn-copy')) {
      assert.ok(btn.attributes['aria-label'], 'copy button has no aria-label');
    }
  });

  test('typing coalesces history writes instead of one per keystroke', async () => {
    const row = findAll(dom['form-rows'], 'query-row')[0];
    const input = findAll(row, 'value-input')[0];
    replaceStateCalls = 0;
    for (const ch of '203.0.113.42') input.input(ch);
    assert.equal(replaceStateCalls, 0, 'history written mid-keystroke');
    await new Promise(r => setTimeout(r, 400));
    assert.equal(replaceStateCalls, 1,
      `12 keystrokes produced ${replaceStateCalls} history writes`);
  });

  test('blur flushes the pending history write immediately', async () => {
    const row = findAll(dom['form-rows'], 'query-row')[0];
    const input = findAll(row, 'value-input')[0];
    input.input('9.9.9.9');
    replaceStateCalls = 0;
    for (const fn of input.listeners.blur || []) fn({ target: input });
    assert.equal(replaceStateCalls, 1, 'blur did not flush the url write');
  });
});
