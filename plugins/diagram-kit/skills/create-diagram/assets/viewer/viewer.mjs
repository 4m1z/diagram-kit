// Interactive viewer: pan and zoom, trace connections, inspect sources, play flows.
// mountDiagram(element, model, options) -> { fit, play, select, destroy }
import { renderSvg } from './render.mjs';

const ICON = {
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  theme: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14"/><path d="M16 5v14"/>',
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};
const svgIcon = (name) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const isUrl = (s) => /^https?:\/\//.test(s);

export function mountDiagram(root, model, options = {}) {
  const opt = { themeToggle: true, themeTarget: document.documentElement, header: true, stepMs: 1500, ...options };
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  root.classList.add('dk-root');
  const flows = model.flows ?? [];
  root.innerHTML =
    `<div class="dk-stage" tabindex="0" aria-label="${escHtml(model.title || 'Diagram')}">${renderSvg(model, { mode: 'vars' })}</div>` +
    (opt.header && model.title ? `<header class="dk-head"><h1>${escHtml(model.title)}${model.draft ? '<span class="dk-draft" title="The brief behind this diagram is not approved yet">Draft</span>' : ''}</h1>${model.subtitle ? `<p>${escHtml(model.subtitle)}</p>` : ''}</header>` : '') +
    `<div class="dk-tools" role="toolbar">` +
    `<button data-act="out" title="Zoom out (−)">${svgIcon('minus')}</button><button data-act="in" title="Zoom in (+)">${svgIcon('plus')}</button><button data-act="fit" title="Fit (F)">${svgIcon('fit')}</button>` +
    (opt.themeToggle ? `<button data-act="theme" title="Theme (T)">${svgIcon('theme')}</button>` : '') +
    `</div>` +
    (flows.length
      ? `<div class="dk-flowbar"><button data-act="play" class="dk-play" title="Play (Space)">${svgIcon('play')}</button>` +
        (flows.length > 1 ? `<select class="dk-flowpick" aria-label="Flow">${flows.map((f, i) => `<option value="${i}">${escHtml(f.label)}</option>`).join('')}</select>` : `<span class="dk-flowname">${escHtml(flows[0].label)}</span>`) +
        `<span class="dk-steptext" aria-live="polite"></span><button data-act="prev" title="Previous (←)">${svgIcon('prev')}</button><button data-act="next" title="Next (→)">${svgIcon('next')}</button></div>`
      : '') +
    `<aside class="dk-panel" hidden><button class="dk-close" data-act="close" title="Close (Esc)">${svgIcon('close')}</button><div class="dk-panel-body"></div></aside>`;

  const stage = root.querySelector('.dk-stage');
  const svg = root.querySelector('svg');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  const panel = root.querySelector('.dk-panel');
  const stepText = root.querySelector('.dk-steptext');
  const W = model.width;
  const H = model.height;
  const view = { x: 0, y: 0, k: 1 };
  let userMoved = false;

  // ---- Pan and zoom by rewriting the viewBox.
  const size = () => ({ w: stage.clientWidth || 1, h: stage.clientHeight || 1 });
  const apply = () => {
    const { w, h } = size();
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${w / view.k} ${h / view.k}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    let g = 16 * view.k;
    while (g < 12) g *= 2; // keep the dot grid calm when zoomed out
    stage.style.backgroundSize = `${g}px ${g}px`;
    stage.style.backgroundPosition = `${-view.x * view.k}px ${-view.y * view.k}px`;
  };
  const fit = () => {
    const { w, h } = size();
    const head = root.querySelector('.dk-head')?.offsetHeight ?? 0;
    const pad = w < 600 ? 12 : 28;
    const k = Math.min((w - pad * 2) / W, (h - pad * 2 - Math.max(0, head - 24)) / H, 2);
    view.k = Math.max(k, 0.05);
    view.x = W / 2 - w / 2 / view.k;
    view.y = H / 2 - (h + Math.max(0, head - 40)) / 2 / view.k;
    userMoved = false;
    apply();
  };
  const zoomAt = (factor, cx, cy) => {
    const k = Math.min(6, Math.max(0.08, view.k * factor));
    const wx = view.x + cx / view.k;
    const wy = view.y + cy / view.k;
    view.k = k;
    view.x = wx - cx / k;
    view.y = wy - cy / k;
    userMoved = true;
    apply();
  };
  const onWheel = (ev) => {
    ev.preventDefault();
    const r = stage.getBoundingClientRect();
    if (ev.ctrlKey || ev.metaKey) zoomAt(Math.exp(-ev.deltaY * 0.01), ev.clientX - r.left, ev.clientY - r.top);
    else { view.x += ev.deltaX / view.k; view.y += ev.deltaY / view.k; userMoved = true; apply(); }
  };
  stage.addEventListener('wheel', onWheel, { passive: false });

  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let pinched = false; // a pinch must not end in a click
  stage.addEventListener('pointerdown', (ev) => {
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 1) drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y, moved: false };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
      pinched = true;
      drag = null;
    }
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const r = stage.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((pinch.k * d) / pinch.d / view.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      return;
    }
    if (!drag) return;
    const dx = ev.clientX - drag.x;
    const dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { drag.moved = true; stage.setPointerCapture(ev.pointerId); stage.classList.add('is-dragging'); }
    view.x = drag.vx - dx / view.k;
    view.y = drag.vy - dy / view.k;
    userMoved = true;
    apply();
  });
  const endPointer = (ev) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) {
      const wasDrag = drag?.moved;
      drag = null;
      stage.classList.remove('is-dragging');
      if (!wasDrag && !pinched && ev.type === 'pointerup') onClick(ev);
      pinched = false;
    }
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  // ---- Highlighting.
  const all = (sel) => [...svg.querySelectorAll(sel)];
  const nodeEl = (id) => svg.querySelector(`.dk-node[data-id="${CSS.escape(id)}"]`);
  const edgeEls = (id) => all(`.dk-edge[data-id="${CSS.escape(id)}"], .dk-edge-label[data-id="${CSS.escape(id)}"]`);
  const clearLit = () => {
    svg.classList.remove('dk-dim');
    for (const el of all('.is-lit, .is-current, .is-selected')) el.classList.remove('is-lit', 'is-current', 'is-selected');
  };
  const lightNode = (id) => {
    const lit = new Set([id]);
    for (const e of model.edges) if (e.from === id || e.to === id) { lit.add(e.from); lit.add(e.to); edgeEls(e.id).forEach((el) => el.classList.add('is-lit')); }
    for (const n of lit) nodeEl(n)?.classList.add('is-lit');
    for (const b of all(`.dk-bar[data-owner="${CSS.escape(id)}"]`)) b.classList.add('is-lit');
    svg.querySelector(`.dk-lifeline[data-id="${CSS.escape(id)}"]`)?.classList.add('is-lit');
    svg.classList.add('dk-dim');
  };
  const groupMembers = (id) => {
    const groups = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of model.groups ?? []) if (g.parent && groups.has(g.parent) && !groups.has(g.id)) { groups.add(g.id); grew = true; }
    }
    return new Set(model.nodes.filter((n) => groups.has(n.group)).map((n) => n.id));
  };
  const lightGroup = (id) => {
    const inside = groupMembers(id);
    for (const n of inside) nodeEl(n)?.classList.add('is-lit');
    for (const e of model.edges) if (inside.has(e.from) && inside.has(e.to)) edgeEls(e.id).forEach((el) => el.classList.add('is-lit'));
    svg.querySelector(`.dk-group-label[data-id="${CSS.escape(id)}"]`)?.classList.add('is-lit');
    svg.querySelector(`.dk-group[data-id="${CSS.escape(id)}"]`)?.classList.add('is-lit');
    svg.classList.add('dk-dim');
  };
  const lightEdge = (id) => {
    const e = model.edges.find((x) => x.id === id);
    if (!e) return;
    edgeEls(id).forEach((el) => el.classList.add('is-lit'));
    nodeEl(e.from)?.classList.add('is-lit');
    nodeEl(e.to)?.classList.add('is-lit');
    svg.classList.add('dk-dim');
  };

  let selected = null;
  let playing = null;
  const hover = (ev) => {
    if (selected || playing) return;
    const n = ev.target.closest?.('.dk-node');
    const e = ev.target.closest?.('.dk-edge, .dk-edge-label');
    clearLit();
    if (n) lightNode(n.dataset.id);
    else if (e) lightEdge(e.dataset.id);
  };
  svg.addEventListener('pointerover', hover);
  svg.addEventListener('pointerleave', () => { if (!selected && !playing) clearLit(); });

  // ---- Inspector.
  const factHtml = (id) => {
    const f = model.facts?.[id];
    if (!f) return '';
    const src = (f.sources ?? []).map((s) => (isUrl(s) ? `<a href="${escHtml(s)}" target="_blank" rel="noopener">${escHtml(s.replace(/^https?:\/\//, '').slice(0, 64))}</a>` : `<code>${escHtml(s)}</code>`)).join(' ');
    const kind = f.kind && f.kind !== 'fact' ? `<span class="dk-kind">${escHtml(f.kind)}</span>` : '';
    return `<li><span class="dk-fid">${escHtml(id)}</span><span>${kind}${escHtml(f.text)}${src ? `<span class="dk-src">${src}</span>` : ''}</span></li>`;
  };
  const show = (item, type) => {
    const title = type === 'edge' ? `${model.nodes.find((n) => n.id === item.from)?.label ?? item.from} → ${model.nodes.find((n) => n.id === item.to)?.label ?? item.to}` : item.label;
    const sub = type === 'edge' ? item.label : item.sub;
    const details = item.details ? `<dl>${Object.entries(item.details).map(([k, v]) => `<dt>${escHtml(k)}</dt><dd>${escHtml(v)}</dd>`).join('')}</dl>` : '';
    const facts = item.facts?.length ? `<ul class="dk-facts">${item.facts.map(factHtml).join('')}</ul>` : '';
    const sources = item.sources?.length ? `<p class="dk-src">${item.sources.map((s) => (isUrl(s) ? `<a href="${escHtml(s)}" target="_blank" rel="noopener">${escHtml(s)}</a>` : `<code>${escHtml(s)}</code>`)).join(' ')}</p>` : '';
    if (!item.about && !details && !facts && !sources && !sub) { panel.hidden = true; return; }
    panel.querySelector('.dk-panel-body').innerHTML =
      `<h2>${escHtml(title)}</h2>${sub ? `<p class="dk-sub">${escHtml(sub)}</p>` : ''}${item.about ? `<p>${escHtml(item.about)}</p>` : ''}${details}${facts}${sources}`;
    panel.hidden = false;
  };
  const select = (type, id) => {
    stop();
    clearLit();
    selected = id ? { type, id } : null;
    if (!id) { panel.hidden = true; return; }
    if (type === 'node') { lightNode(id); nodeEl(id)?.classList.add('is-selected'); show(model.nodes.find((n) => n.id === id), 'node'); }
    else if (type === 'group') { lightGroup(id); show(model.groups.find((g) => g.id === id), 'group'); }
    else { lightEdge(id); show(model.edges.find((e) => e.id === id), 'edge'); }
  };
  function onClick(ev) {
    if (ev.target.closest?.('button, select, a, .dk-panel')) return;
    const n = ev.target.closest?.('.dk-node');
    const e = ev.target.closest?.('.dk-edge, .dk-edge-label');
    const g = ev.target.closest?.('.dk-group-label, .dk-group:not(.dk-fragment)');
    if (n && n.dataset.shape !== 'note') select('node', n.dataset.id);
    else if (e) select('edge', e.dataset.id);
    else if (g) select('group', g.dataset.id);
    else select(null, null);
  }

  // ---- Flows: light the path step by step; a packet travels the current wire.
  let flowIndex = 0;
  let step = -1;
  let packet = null;
  let raf = 0;
  const stepLabel = () => {
    if (!stepText) return;
    const f = flows[flowIndex];
    stepText.textContent = step < 0 ? `${f.steps.length} steps` : `${step + 1}/${f.steps.length}  ${f.steps[step].text ?? ''}`;
  };
  const showStep = (i, animate = true) => {
    const f = flows[flowIndex];
    if (!f) return;
    step = Math.max(-1, Math.min(i, f.steps.length - 1));
    clearLit();
    selected = null;
    panel.hidden = true;
    if (step < 0) { stepLabel(); return; }
    svg.classList.add('dk-dim');
    f.steps.slice(0, step + 1).forEach((s, k) => {
      const e = model.edges.find((x) => x.id === s.edge);
      if (!e) return;
      edgeEls(e.id).forEach((el) => el.classList.add(k === step ? 'is-current' : 'is-lit', 'is-lit'));
      nodeEl(e.from)?.classList.add('is-lit');
      nodeEl(e.to)?.classList.add('is-lit');
    });
    for (const b of all(`.dk-badge[data-flow="${CSS.escape(f.id)}"]`)) b.classList.toggle('is-current', Number(b.dataset.step) === step + 1);
    stepLabel();
    if (animate && !reduced) runPacket(f.steps[step].edge);
  };
  const runPacket = (edgeId) => {
    cancelAnimationFrame(raf);
    packet?.remove();
    const path = svg.querySelector(`.dk-edge[data-id="${CSS.escape(edgeId)}"] .dk-line`);
    if (!path?.getTotalLength) return;
    const len = path.getTotalLength();
    packet = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    packet.setAttribute('r', '4');
    packet.setAttribute('class', 'dk-packet');
    svg.querySelector('.dk-world').appendChild(packet);
    const t0 = performance.now();
    const dur = Math.min(1100, Math.max(450, len * 2.2));
    const tick = (t) => {
      const u = Math.min(1, (t - t0) / dur);
      const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      const p = path.getPointAtLength(e * len);
      packet.setAttribute('cx', p.x);
      packet.setAttribute('cy', p.y);
      if (u < 1) raf = requestAnimationFrame(tick);
      else { packet.classList.add('is-done'); }
    };
    raf = requestAnimationFrame(tick);
  };
  let timer = 0;
  const playBtn = root.querySelector('.dk-play');
  function stop() {
    clearInterval(timer);
    playing = null;
    playBtn && (playBtn.innerHTML = svgIcon('play'));
    root.classList.remove('is-playing');
  }
  const play = () => {
    if (playing) { stop(); return; }
    const f = flows[flowIndex];
    if (!f) return;
    playing = true;
    root.classList.add('is-playing');
    playBtn.innerHTML = svgIcon('pause');
    if (step >= f.steps.length - 1) step = -1;
    showStep(step + 1);
    timer = setInterval(() => {
      if (step >= f.steps.length - 1) { stop(); return; }
      showStep(step + 1);
    }, opt.stepMs);
  };
  root.querySelector('.dk-flowpick')?.addEventListener('change', (ev) => { stop(); flowIndex = Number(ev.target.value); showStep(-1); });
  if (flows.length) stepLabel();

  // ---- Buttons and keys.
  const setTheme = () => {
    const t = opt.themeTarget;
    const dark = t.dataset.theme ? t.dataset.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    t.dataset.theme = dark ? 'light' : 'dark';
  };
  const actions = {
    in: () => { const { w, h } = size(); zoomAt(1.25, w / 2, h / 2); },
    out: () => { const { w, h } = size(); zoomAt(0.8, w / 2, h / 2); },
    fit,
    theme: setTheme,
    play,
    prev: () => { stop(); showStep(step - 1); },
    next: () => { stop(); showStep(step + 1); },
    close: () => select(null, null),
  };
  const onRootClick = (ev) => {
    const b = ev.target.closest('button[data-act]');
    if (b) actions[b.dataset.act]?.();
  };
  root.addEventListener('click', onRootClick);
  const onKey = (ev) => {
    if (ev.target.closest?.('input, select, textarea')) return;
    const k = ev.key;
    if (k === 'Escape') { stop(); select(null, null); showStep(-1, false); }
    else if (k === 'f' || k === 'F') fit();
    else if (k === '+' || k === '=') actions.in();
    else if (k === '-') actions.out();
    else if ((k === 't' || k === 'T') && opt.themeToggle) setTheme();
    else if (k === ' ' && flows.length) { ev.preventDefault(); play(); }
    else if (k === 'ArrowRight' && flows.length) actions.next();
    else if (k === 'ArrowLeft' && flows.length) actions.prev();
  };
  (opt.keyTarget ?? window).addEventListener('keydown', onKey);

  const ro = new ResizeObserver(() => (userMoved ? apply() : fit()));
  ro.observe(stage);
  fit();

  return {
    fit,
    play,
    select,
    step: (i) => showStep(i),
    destroy() {
      stop();
      cancelAnimationFrame(raf);
      packet?.remove();
      ro.disconnect();
      root.removeEventListener('click', onRootClick);
      (opt.keyTarget ?? window).removeEventListener('keydown', onKey);
      root.innerHTML = '';
      root.classList.remove('dk-root');
    },
  };
}
