// ============================================================
// Obsluha dřívějších inline událostí (onclick="…", onchange="…" apod.) bez 'unsafe-inline' a bez eval.
//
// Kód mapy vkládá do stránky HTML s atributy typu onclick="funkce('a', 1)". Přísná CSP takové atributy
// nespouští, proto je tento skript na začátku načte, převede na běžné posluchače událostí a atribut odstraní.
// Neprovádí libovolný JavaScript. Rozumí jen jednoduchým příkazům:
//   - volání funkce:  nazev(arg, …)   window.nazev(…)   event.stopPropagation()   this.parentElement.remove()
//   - přiřazení:      this.src='…'   this.style.display='none'   this.onerror=null   window._x=…
// Argumenty smí být řetězce, čísla, true/false/null, this/event nebo cesta k vlastnosti (this.checked).
// Cokoli jiného (eval, Function, innerHTML, …) se ignoruje.
// ============================================================
(function () {
  'use strict';
  const EVENTS = ['click', 'change', 'input', 'submit', 'error', 'load', 'keydown', 'keyup', 'focus', 'blur', 'mouseover', 'mouseout', 'touchstart'];
  const ATTRS = EVENTS.map((e) => 'on' + e);
  const SELECTOR = ATTRS.map((a) => '[' + a + ']').join(',');
  const BLOCKED = new Set(['eval', 'Function', 'constructor', '__proto__', 'prototype', 'write', 'writeln', 'innerHTML', 'outerHTML',
    'insertAdjacentHTML', 'setAttribute', 'setAttributeNS', 'createElement', 'importScripts', 'execScript', 'srcdoc', 'cookie', 'localStorage', 'sessionStorage']);
  const cache = new Map();

  function tokenize(src) {
    const out = []; let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === "'" || ch === '"') {
        let j = i + 1, s = '';
        while (j < src.length && src[j] !== ch) { if (src[j] === '\\' && j + 1 < src.length) { j++; const n = src[j]; s += n === 'n' ? '\n' : n === 't' ? '\t' : n; } else s += src[j]; j++; }
        if (j >= src.length) throw new Error('neuzavřený řetězec');
        out.push({ t: 'str', v: s }); i = j + 1; continue;
      }
      if (/[0-9-]/.test(ch) && (ch !== '-' || /[0-9.]/.test(src[i + 1] || ''))) {
        let j = i + 1; while (j < src.length && /[0-9.eE]/.test(src[j])) j++;
        out.push({ t: 'num', v: parseFloat(src.slice(i, j)) }); i = j; continue;
      }
      if (/[A-Za-z_$]/.test(ch) || (ch === '.' && /[A-Za-z_$]/.test(src[i + 1] || ''))) {
        let j = i + 1; while (j < src.length && /[\w$.]/.test(src[j])) j++;
        out.push({ t: 'id', v: src.slice(i, j) }); i = j; continue;
      }
      if ('(),=;!'.includes(ch)) { out.push({ t: ch }); i++; continue; }
      throw new Error('nepodporovaný znak ' + ch);
    }
    return out;
  }

  function compile(code) {
    const toks = tokenize(code);
    let p = 0;
    const peek = () => toks[p];
    const eat = (t) => { if (!toks[p] || toks[p].t !== t) throw new Error('očekáváno ' + t); return toks[p++]; };
    function expr() {
      const k = peek(); if (!k) throw new Error('chybí výraz');
      if (k.t === '!') { p++; return { not: expr() }; }
      if (k.t === 'str' || k.t === 'num') { p++; return { lit: k.v }; }
      if (k.t === 'id') {
        p++;
        if (k.v === 'true') return { lit: true };
        if (k.v === 'false') return { lit: false };
        if (k.v === 'null') return { lit: null };
        if (k.v === 'undefined') return { lit: undefined };
        return { path: k.v.split('.') };
      }
      throw new Error('nepodporovaný výraz');
    }
    const stmts = [];
    while (p < toks.length) {
      if (peek().t === ';') { p++; continue; }
      let ret = false;
      if (peek().t === 'id' && peek().v === 'return') { ret = true; p++; }
      if (ret && (!peek() || peek().t === ';')) { stmts.push({ ret: true, e: { lit: undefined } }); continue; }
      const id = eat('id');
      const path = id.v.split('.');
      if (path.some((s) => BLOCKED.has(s))) throw new Error('zakázaný název ' + id.v);
      if (peek() && peek().t === '(') {
        p++; const args = [];
        if (peek() && peek().t !== ')') { args.push(expr()); while (peek() && peek().t === ',') { p++; args.push(expr()); } }
        eat(')');
        // řetězené volání, např. document.getElementById('x').classList.add('y')
        const chain = [];
        while (peek() && peek().t === 'id' && peek().v.startsWith('.')) {
          const cp = eat('id').v.slice(1).split('.');
          if (cp.some((x) => BLOCKED.has(x))) throw new Error('zakázaný název ' + cp.join('.'));
          eat('('); const cargs = [];
          if (peek() && peek().t !== ')') { cargs.push(expr()); while (peek() && peek().t === ',') { p++; cargs.push(expr()); } }
          eat(')');
          chain.push({ path: cp, args: cargs });
        }
        stmts.push({ call: path, args, ret, chain });
      } else if (peek() && peek().t === '=') {
        p++;
        const v = expr();
        const root = path[0];
        if (!(root === 'this' || (root === 'window' && path[1] && path[1].startsWith('_')))) throw new Error('přiřazení jen do this.* nebo window._*');
        stmts.push({ assign: path, value: v });
      } else if (ret) {
        stmts.push({ ret: true, e: { path } });
      } else throw new Error('nepodporovaný příkaz');
    }
    return stmts;
  }

  function lookup(path, ctx) {
    let obj; const root = path[0];
    if (root === 'this') obj = ctx.el; else if (root === 'event') obj = ctx.ev; else if (root === 'window') obj = window; else if (root === 'document') obj = document;
    else if (root in window) obj = window[root]; else throw new Error('neznámé ' + root);
    let parent = null;
    for (let i = 1; i < path.length; i++) { parent = obj; obj = obj == null ? undefined : obj[path[i]]; }
    return { value: obj, parent: path.length > 1 ? parent : (root === 'this' || root === 'event' ? null : window) };
  }
  const ev = (e, ctx) => e.lit !== undefined || 'lit' in e ? e.lit : e.not ? !ev(e.not, ctx) : lookup(e.path, ctx).value;

  function run(stmts, el, event) {
    const ctx = { el, ev: event };
    for (const s of stmts) {
      if (s.call) {
        const { value: fn, parent } = lookup(s.call, ctx);
        if (typeof fn !== 'function') throw new Error('není funkce: ' + s.call.join('.'));
        let r = fn.apply(parent, s.args.map((a) => ev(a, ctx)));
        for (const c of (s.chain || [])) {
          let o = r, par = null;
          for (const seg of c.path) { par = o; o = o == null ? undefined : o[seg]; }
          if (typeof o !== 'function') throw new Error('není funkce: ' + c.path.join('.'));
          r = o.apply(par, c.args.map((a) => ev(a, ctx)));
        }
        if (s.ret && r === false) { event.preventDefault(); return; }
      } else if (s.assign) {
        const path = s.assign; let target = path[0] === 'this' ? el : window;
        for (let i = 1; i < path.length - 1; i++) target = target[path[i]];
        target[path[path.length - 1]] = ev(s.value, ctx);
      } else if (s.ret) {
        if (ev(s.e, ctx) === false) event.preventDefault();
        return;
      }
    }
  }

  function bind(el) {
    if (!el || el.nodeType !== 1) return;
    for (const attr of Array.from(el.attributes)) {
      if (!ATTRS.includes(attr.name)) continue;
      const evName = attr.name.slice(2), code = attr.value;
      el.removeAttribute(attr.name); // atribut už nevznikne CSP chyba a nespustí se podruhé
      let stmts = cache.get(code);
      if (!stmts) { try { stmts = compile(code); cache.set(code, stmts); } catch (err) { console.warn('[csp-handlers] ignorováno:', code.slice(0, 80), err.message); continue; } }
      el.addEventListener(evName, (event) => { try { run(stmts, el, event); } catch (err) { console.warn('[csp-handlers]', err.message); } });
    }
  }
  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    bind(node);
    if (node.querySelectorAll) node.querySelectorAll(SELECTOR).forEach(bind);
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') bind(m.target);
      else m.addedNodes.forEach(scan);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ATTRS });
  document.addEventListener('DOMContentLoaded', () => scan(document.documentElement));
  window.__cspHandlers = { compile, run }; // pro testy
})();
