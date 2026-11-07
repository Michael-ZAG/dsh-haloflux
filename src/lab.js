/**
 * HALOFLUX for DSH - lab rack (React, no JSX, no imports).
 *
 * Declares exactly one global: `HalofluxLab = { Rack }`.
 * `React` is injected as a shared const by build.mjs; every element is built
 * with `h(...)`, never JSX.
 *
 * Eight stacked panels, ported from the upstream research HUD:
 *   rail (6 rows, top to bottom):
 *   1. ADVECTION / PARTICLE SOLVER - abstract flow field, 320 advected particles
 *   2. INVESTIGATION FEED          - real session feed + token tail (live.feed / live.recentText)
 *   3. 12 AGENTS / DISPATCH        - real tool dispatch, 2 columns x 6 rows (live.tools)
 *   4. METHOD WORKSPACE            - real typewriter over the streaming tail (live.recentText)
 *   5. SOURCE / EXTRACTION ROUTES  - abstract 6 x 3 route matrix
 *   6. METHOD / REFERENCE INDEX    - abstract 11 x 28 match heat map + scan line
 *   bottom-right dock (2 rows, under the whale widget):
 *   7. VALIDATION / SAMPLE BUFFER  - abstract 3 x 160 sample buffer + cursor
 *   8. SCENE / DIFFERENCE FIELD    - abstract 2 x (22 x 13) field + histogram
 *
 * Panels 1, 5, 6, 7, 8 are abstract instrumentation from the original design and
 * are marked `illustrative`; they do not claim to show real data. Panels 2, 3 and
 * 4 are entirely live and stay blank when there is nothing to show.
 *
 * Animation contract: one shared 30fps rAF loop for every mounted canvas. Each
 * panel registers a draw job on mount and unregisters on unmount, so hiding the
 * HUD (or turning the rack off) leaves no timer behind. `prefers-reduced-motion`
 * gets a single static frame instead of the loop.
 *
 * These panels are `pointer-events:none` (see mount.js BASE_CSS): the rail sits
 * over the transcript and must never steal a click from the chat.
 */

/* HALOFLUX lab panels - ported from HALOFLUX by Ryder191
   https://github.com/Ryder191/haloflux · PolyForm Noncommercial 1.0.0 */
const HalofluxLab = (function () {
  const h = React.createElement;
  const FONT = '"JetBrains Mono",Consolas,ui-monospace,monospace';
  const PINK = '#f0a6c6';
  const TEAL = '#98e0cf';
  const WARN = '#ffb648';
  const OK = '#7ddc9a';
  const ERR = '#f08a8a';

  const MAX_FEED = 9;          // feed lines kept in the DOM
  const MAX_AGENTS = 12;       // tool rows in the dispatch panel
  const MAX_TOK = 110;         // chars of token stream shown
  const CELLS = 6;             // progress cells per agent row
  const PARTICLES = 320;       // advected particles
  const IDX_ROWS = 11;         // reference index rows
  const IDX_COLS = 28;         // reference index columns
  const FRAME_MS = 33;         // ~30fps for both canvases

  const MAX_CODE = 8;          // typewriter lines kept in the DOM (METHOD WORKSPACE)
  const CODE_TICK = 70;        // ms per typewriter beat
  const CODE_WRAP = 42;        // hard wrap before this many chars
  const VAL_POINTS = 160;      // samples per curve (VALIDATION)
  const VAL_LABELS = ['TOKENS', 'RATE', 'DRIFT'];
  const DIFF_ROWS = 13;        // SCENE / DIFFERENCE FIELD grid
  const DIFF_COLS = 22;
  const HIST_BARS = 28;        // histogram under the difference field
  const ROUTE_ROWS = ['session', 'context', 'tools', 'memory', 'files', 'queue'];
  const ROUTE_COLS = ['EXTRACT', 'ATTACH', 'INSPECT'];
  const ROUTE_MARK = ['·', '▪', '▪▪'];

  const rnd = Math.random;
  const rr = (a, b) => a + rnd() * (b - a);
  const asText = (v) => (v == null ? '' : String(v));
  const asList = (v) => (Array.isArray(v) ? v : []);
  const clip = (s, n) => {
    s = asText(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  };
  const pad2 = (n) => String(n).padStart(2, '0');
  const hhmm = (t) => {
    const d = new Date(Number(t) || Date.now());
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  };

  /** longest suffix of `seen` that is a prefix of `now` -> the chars not shown yet */
  function newSuffix(seen, now) {
    const a = asText(seen);
    const b = asText(now);
    const max = Math.min(a.length, b.length);
    for (let k = max; k > 0; k -= 1) {
      if (a.slice(a.length - k) === b.slice(0, k)) return b.slice(k);
    }
    return b;
  }

  /** cheap normal-ish noise in [-1, 1] for the sample buffers */
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

  const KIND_COLOR = {
    user: '#7fd8ff',
    assistant: '#e6ecff',
    tool: WARN,
    error: ERR,
    turn: '#ffcf7a',
    system: '#6a7285',
  };

  const prefersReduced = () => {
    try {
      return typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  };

  /* ---------------------------------------------------------------- *
   * shared 30fps draw loop: jobs register on mount, stop when empty
   * ---------------------------------------------------------------- */

  const jobs = new Set();
  let rafId = 0;
  let prev = 0;
  let thr = 0;

  function loop(now) {
    const dt = Math.min(0.05, Math.max(0.001, (now - prev) / 1000 || 0.016));
    prev = now;
    if (now - thr >= FRAME_MS) {
      thr = now;
      jobs.forEach((fn) => {
        try {
          fn(dt);
        } catch {
          /* one bad panel must never stop the others */
        }
      });
    }
    rafId = requestAnimationFrame(loop);
  }

  function addJob(fn) {
    jobs.add(fn);
    if (!rafId) {
      prev = performance.now();
      thr = 0;
      rafId = requestAnimationFrame(loop);
    }
    return () => {
      jobs.delete(fn);
      if (!jobs.size && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };
  }

  /* ---------------------------------------------------------------- *
   * canvas sizing: clientWidth/Height (immune to hudScale), dpr capped 2
   * ---------------------------------------------------------------- */

  function fit(c) {
    const w = Math.max(1, Math.round(c.clientWidth || 1));
    const hh = Math.max(1, Math.round(c.clientHeight || 1));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(hh * dpr));
    // only touch the backing store when it actually changed: assigning
    // width/height reallocates the buffer and resets the whole 2D state
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    }
    const x = c.getContext('2d');
    if (!x) return null;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.w = w;
    c.h = hh;
    c.x = x;
    return c;
  }

  /** Size the canvas once and again whenever the rail is laid out/resized. */
  function useCanvas(mount, draw) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const c = ref.current;
      if (!c) return undefined;
      let off = null;
      let disposed = false;
      const start = () => {
        if (disposed || !fit(c)) return;
        mount(c);
        if (prefersReduced()) draw(c, 0.016, 0);
      };
      start();
      let ro = null;
      if (typeof ResizeObserver === 'function') {
        ro = new ResizeObserver(() => {
          if (!disposed) start();
        });
        ro.observe(c);
      }
      if (!prefersReduced()) {
        off = addJob((dt) => draw(c, dt, 0));
      }
      return () => {
        disposed = true;
        if (off) off();
        if (ro) ro.disconnect();
      };
    }, []);
    return ref;
  }

  /* ---------------------------------------------------------------- *
   * panel 1: investigation feed
   * ---------------------------------------------------------------- */

  function FeedPanel(props) {
    const live = props.live || {};
    const view = React.useMemo(() => {
      const source = asList(live.feed);
      const rows = [];
      for (let i = source.length - 1; i >= 0 && rows.length < MAX_FEED; i -= 1) {
        const item = source[i] || {};
        const kind = asText(item.kind || 'system').toLowerCase().replace(/[^a-z]/g, '') || 'system';
        rows.push({
          key: 'f' + i,
          ts: hhmm(item.t),
          kind,
          color: KIND_COLOR[kind] || KIND_COLOR.system,
          text: clip(item.text, 90),
        });
      }
      // built newest-first, then flipped: the newest row must be the last child
      // so the `:last-child` emphasis can highlight it
      rows.reverse();
      const tail = typeof live.recentText === 'string' ? live.recentText : '';
      return { rows, tok: clip(tail.replace(/\s+/g, ' ').trim(), MAX_TOK) };
    }, [live, props.liveTick]);

    return h('div', { className: 'hfx-lab' },
      h('h3', null, 'INVESTIGATION FEED'),
      h('div', { className: 'hfx-lab-feed' },
        view.rows.length
          ? view.rows.map((r) => h('div', { key: r.key, className: 'hfx-lab-row' },
            h('span', { className: 'ts' }, r.ts),
            h('span', { className: 'kd', style: { color: r.color } }, r.kind.toUpperCase()),
            h('span', { className: 'tx' }, r.text)))
          : h('div', { className: 'hfx-lab-row' }, '等待会话事件')),
      h('div', { className: 'hfx-lab-tok' },
        h('b', null, 'TOKENS'),
        view.tok || '—'));
  }

  /* ---------------------------------------------------------------- *
   * panel 2: 12 agents / dispatch
   * ---------------------------------------------------------------- */

  function cellsOf(state) {
    const out = [];
    for (let i = 0; i < CELLS; i += 1) out.push(null);
    if (state === 'ok') {
      for (let i = 0; i < CELLS; i += 1) out[i] = { background: OK };
    } else if (state === 'error') {
      for (let i = 0; i < CELLS; i += 1) out[i] = { background: ERR };
    } else if (state === 'running') {
      for (let i = 0; i < 3; i += 1) out[i] = { background: WARN };
      out[3] = { background: WARN, animation: 'hfx-lab-pulse 1s steps(2,end) infinite' };
    }
    return out;
  }

  const STATE_LABEL = { running: 'working', ok: 'ok', error: 'error' };
  const STATE_CLASS = { running: 'run', ok: 'ok', error: 'err' };

  function AgentsPanel(props) {
    const live = props.live || {};
    const rows = React.useMemo(() => {
      const src = asList(live.tools).slice(-MAX_AGENTS);
      const out = [];
      for (let i = 0; i < MAX_AGENTS; i += 1) {
        const it = src[i];
        if (!it) {
          out.push({ key: 'e' + i, id: pad2(i + 1), name: '--', state: 'idle', cells: cellsOf('idle') });
          continue;
        }
        const state = asText(it.state || 'running').toLowerCase();
        out.push({
          key: 't' + i,
          id: pad2(i + 1),
          name: clip(it.name || it.id || '--', 14),
          state,
          cells: cellsOf(state),
        });
      }
      return out;
    }, [live, props.liveTick]);

    return h('div', { className: 'hfx-lab' },
      h('h3', null, '12 AGENTS / DISPATCH'),
      h('div', { className: 'hfx-lab-agents' },
        rows.map((r) => h('div', { key: r.key, className: 'hfx-lab-ag' },
          h('span', { className: 'id' }, r.id),
          h('span', { className: 'nm' }, r.name),
          h('span', { className: 'cells' },
            r.cells.map((style, i) => h('i', { key: i, style: style || undefined }))),
          h('span', { className: 'st ' + (STATE_CLASS[r.state] || '') },
            STATE_LABEL[r.state] || 'idle')))));
  }

  /* ---------------------------------------------------------------- *
   * panel 3: advection / particle solver
   * ---------------------------------------------------------------- */

  const STAGES = ['ADVECT', 'PROJECT', 'RENDER'];

  const flow = (x, y, T) => Math.sin(x * 0.035 + T * 0.6) * Math.cos(y * 0.05 - T * 0.4) * Math.PI
    + Math.sin((x + y) * 0.01 + T * 0.2);

  function drawAdv(c, P, dt, T) {
    const x = c.x;
    if (!x) return;
    const w = c.w;
    const hh = c.h;
    // translucent clear = comet trails; the panel background shows through
    x.fillStyle = 'rgba(14,15,18,0.22)';
    x.fillRect(0, 0, w, hh);
    x.fillStyle = 'rgba(120,125,135,.25)';
    for (let i = 6; i < w; i += 12) {
      for (let j = 6; j < hh; j += 12) x.fillRect(i, j, 1, 1);
    }
    x.strokeStyle = 'rgba(235,238,244,.7)';
    x.lineWidth = 0.8;
    x.beginPath();
    for (const p of P) {
      const a = flow(p.x, p.y, T);
      const nx = p.x + Math.cos(a) * 22 * dt;
      const ny = p.y + Math.sin(a) * 22 * dt;
      x.moveTo(p.x, p.y);
      x.lineTo(nx + Math.cos(a) * 2, ny + Math.sin(a) * 2);
      p.x = nx;
      p.y = ny;
      p.l -= dt;
      if (p.l < 0 || p.x < 0 || p.x > w || p.y < 0 || p.y > hh) {
        p.x = rnd() * w;
        p.y = rnd() * hh;
        p.l = rr(1, 4);
      }
    }
    x.stroke();
  }

  function AdvPanel() {
    const chips = React.useRef(null);
    let T = 0;
    let P = [];
    const mount = (c) => {
      P = [];
      for (let i = 0; i < PARTICLES; i += 1) {
        P.push({ x: rnd() * c.w, y: rnd() * c.h, l: rr(1, 4) });
      }
      T = 0;
    };
    const ref = useCanvas(mount, (c, dt, t0) => {
      T += dt || t0;
      drawAdv(c, P, dt || 0.016, T);
    });

    React.useEffect(() => {
      if (prefersReduced()) return undefined;
      const host = chips.current;
      if (!host) return undefined;
      const els = Array.prototype.slice.call(host.children);
      if (els.length < 2) return undefined;
      let k = 0;
      const id = window.setInterval(() => {
        k = (k + 1) % els.length;
        for (let i = 0; i < els.length; i += 1) {
          if (i === k) els[i].classList.add('on');
          else els[i].classList.remove('on');
        }
      }, 1400);
      return () => window.clearInterval(id);
    }, []);

    return h('div', { className: 'hfx-lab' },
      h('h3', null, 'ADVECTION / PARTICLE SOLVER'),
      h('canvas', { ref }),
      h('div', { className: 'hfx-lab-chips', ref: chips },
        STAGES.map((name, i) => h('span', { key: name, className: i === 0 ? 'on' : undefined }, name))));
  }

  /* ---------------------------------------------------------------- *
   * panel 4: method / reference index
   * ---------------------------------------------------------------- */

  function drawIdx(c, IDX, T) {
    const x = c.x;
    if (!x) return;
    const w = c.w;
    const hh = c.h;
    x.clearRect(0, 0, w, hh);
    x.font = '600 6.5px ' + FONT;
    x.textBaseline = 'middle';
    const lx = 24;
    const rx = 34;
    const cw = Math.max(1, (w - lx - rx) / IDX_COLS);
    const ch = hh / IDX_ROWS;
    const scan = Math.floor((T * 6) % IDX_COLS);
    // the index "warms up" over time: one cell per frame drifts brighter
    if (rnd() < 0.3) IDX[(rnd() * IDX_ROWS) | 0][(rnd() * IDX_COLS) | 0] = rnd();
    for (let j = 0; j < IDX_ROWS; j += 1) {
      x.fillStyle = '#6b6f78';
      x.fillText('M' + pad2(j + 1), 0, j * ch + ch / 2);
      let match = 0;
      for (let i = 0; i < IDX_COLS; i += 1) {
        const v = IDX[j][i];
        x.fillStyle = v > 0.86 ? PINK : v > 0.7 ? 'rgba(240,166,198,.45)' : v > 0.4 ? '#4a4e56' : '#1c1e23';
        if (i === scan) x.fillStyle = v > 0.4 ? '#ffffff' : '#3a3e46';
        x.fillRect(lx + i * cw, j * ch + 1, Math.max(1, cw - 1), Math.max(1, ch - 2));
        if (v > 0.7) match += 1;
      }
      x.fillStyle = match > 7 ? PINK : '#9a9ea7';
      x.fillText(match > 7 ? 'review' : 'match', w - rx + 4, j * ch + ch / 2);
    }
  }

  function IndexPanel() {
    let IDX = [];
    let T = 0;
    const mount = () => {
      IDX = [];
      for (let j = 0; j < IDX_ROWS; j += 1) {
        const row = [];
        for (let i = 0; i < IDX_COLS; i += 1) row.push(rnd());
        IDX.push(row);
      }
      T = 0;
    };
    const ref = useCanvas(mount, (c, dt) => {
      T += dt;
      drawIdx(c, IDX, T);
    });
    return h('div', { className: 'hfx-lab' },
      h('h3', null, 'METHOD / REFERENCE INDEX'),
      h('canvas', { ref }));
  }

  /* ---------------------------------------------------------------- *
   * panel: method workspace (live typewriter over the streaming tail)
   * ---------------------------------------------------------------- */

  /** the streaming tail is a moving window: only replay the part never shown */
  function WorkspacePanel(props) {
    const liveRef = React.useRef(props.live || {});
    liveRef.current = props.live || {};
    const cursor = React.useRef({ seen: '', next: 1 });
    // start empty: the first typed row must claim n = 1 from the cursor,
    // otherwise a pre-seeded row collides with it and "01" shows up twice
    const [rows, setRows] = React.useState(() => []);

    React.useEffect(() => {
      const st = cursor.current;
      const id = window.setInterval(() => {
        const live = liveRef.current || {};
        const now = typeof live.recentText === 'string' ? live.recentText : '';
        const delta = newSuffix(st.seen, now);
        if (!delta) return; // nothing real to show: never invent text
        const take = delta.slice(0, 2 + ((rnd() * 3) | 0));
        st.seen = (st.seen + take).slice(-400);
        setRows((prev) => {
          const out = prev.length ? prev.map((r) => ({ n: r.n, text: r.text })) : [];
          let open = out.length ? out[out.length - 1] : null;
          for (let i = 0; i < take.length; i += 1) {
            const ch = take.charAt(i);
            if (!open) {
              open = { n: st.next, text: '' };
              st.next += 1;
              out.push(open);
            }
            if (ch === '\n' || ch === '\r') {
              open = { n: st.next, text: '' };
              st.next += 1;
              out.push(open);
              continue;
            }
            open.text += ch;
            if (open.text.length >= CODE_WRAP || /[。！？；.!?;]/.test(ch)) {
              open = { n: st.next, text: '' };
              st.next += 1;
              out.push(open);
            }
          }
          return out.slice(-MAX_CODE);
        });
      }, CODE_TICK);
      return () => window.clearInterval(id);
    }, []);

    const shown = rows.length ? rows : [{ n: 1, text: '' }];
    return h('div', { className: 'hfx-lab' },
      h('h3', null, 'METHOD WORKSPACE'),
      h('div', { className: 'hfx-lab-code' },
        shown.map((r, i) => h('div', { key: r.n },
          h('span', { className: 'ln' }, pad2(r.n)),
          h('span', { className: 'tx' }, r.text,
            i === shown.length - 1 ? h('span', { className: 'caret' }) : null)))));
  }

  /* ---------------------------------------------------------------- *
   * panel: source / extraction routes (illustrative 6 x 3 matrix)
   * ---------------------------------------------------------------- */

  function initRoutes() {
    const out = [];
    for (let i = 0; i < ROUTE_ROWS.length; i += 1) {
      const row = [];
      for (let j = 0; j < ROUTE_COLS.length; j += 1) row.push(rnd() < 0.45 ? 2 : rnd() < 0.55 ? 1 : 0);
      out.push(row);
    }
    return out;
  }

  function RoutesPanel() {
    const [grid, setGrid] = React.useState(initRoutes);
    React.useEffect(() => {
      if (prefersReduced()) return undefined;
      const id = window.setInterval(() => {
        setGrid((prev) => {
          const next = prev.map((row) => row.slice());
          const r = (rnd() * next.length) | 0;
          const c = (rnd() * next[r].length) | 0;
          next[r][c] = (next[r][c] + 1) % 3;
          return next;
        });
      }, 500);
      return () => window.clearInterval(id);
    }, []);

    return h('div', { className: 'hfx-lab' },
      h('h3', null, 'SOURCE / EXTRACTION ROUTES'),
      h('div', { className: 'hfx-lab-routes' },
        h('span', { className: 'hd' }, 'route'),
        ROUTE_COLS.map((c) => h('span', { key: 'h' + c, className: 'hd' }, c)),
        ROUTE_ROWS.map((name, i) => h(React.Fragment, { key: name },
          h('span', { className: 'nm' }, name),
          ROUTE_COLS.map((c, j) => h('span', {
            key: name + ':' + c,
            className: 'mk s' + (grid[i] ? grid[i][j] : 0),
          }, ROUTE_MARK[grid[i] ? grid[i][j] : 0]))))),
      h('div', { className: 'cap' }, 'illustrative'));
  }

  /* ---------------------------------------------------------------- *
   * dock panel: validation / sample buffer
   * ---------------------------------------------------------------- */

  function drawVal(c, B, T) {
    const x = c.x;
    if (!x || !B.length) return;
    const w = c.w;
    const hh = c.h;
    x.clearRect(0, 0, w, hh);
    const gutter = 30;
    const lane = hh / B.length;
    const plotX = gutter + 2;
    const plotW = Math.max(8, w - plotX - 2);
    x.font = '600 6px ' + FONT;
    x.textBaseline = 'middle';
    for (let k = 0; k < B.length; k += 1) {
      const top = lane * k;
      x.fillStyle = '#6b6f78';
      x.fillText(VAL_LABELS[k] || 'L' + k, 0, top + lane / 2);
      x.strokeStyle = 'rgba(58,62,70,.5)';
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(plotX, top + lane - 1.5);
      x.lineTo(plotX + plotW, top + lane - 1.5);
      x.stroke();
      const data = B[k];
      const n = data.length;
      const peak = data[n - 1] > 0.82;
      x.strokeStyle = peak ? PINK : '#e6e8ec';
      x.lineWidth = 0.9;
      x.beginPath();
      for (let i = 0; i < n; i += 1) {
        const px = plotX + (i / (n - 1 || 1)) * plotW;
        const py = top + lane - 3 - data[i] * (lane - 6);
        if (i) x.lineTo(px, py);
        else x.moveTo(px, py);
      }
      x.stroke();
    }
    // pink cursor sweeping the buffer
    const cx = plotX + ((T * 0.22) % 1) * plotW;
    x.globalAlpha = 0.55;
    x.strokeStyle = PINK;
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(cx, 0);
    x.lineTo(cx, hh);
    x.stroke();
    x.globalAlpha = 1;
  }

  function ValPanel() {
    let B = [];
    let T = 0;
    const mount = () => {
      B = [];
      for (let k = 0; k < VAL_LABELS.length; k += 1) {
        const arr = [];
        for (let i = 0; i < VAL_POINTS; i += 1) {
          arr.push(0.5 + gauss() * 0.12 + Math.sin(i * 0.05 + k) * 0.18);
        }
        B.push(arr);
      }
      T = 0;
    };
    const ref = useCanvas(mount, (c, dt) => {
      T += dt;
      if (!B.length) return;
      for (let k = 0; k < B.length; k += 1) {
        const arr = B[k];
        arr.shift();
        arr.push(Math.max(0.02, Math.min(0.98,
          0.5 + gauss() * 0.16 + Math.sin(T * (1.4 + k * 0.7)) * 0.22)));
      }
      drawVal(c, B, T);
    });
    return h('div', { className: 'hfx-lab' },
      h('h3', null, 'VALIDATION / SAMPLE BUFFER'),
      h('canvas', { ref }),
      h('div', { className: 'cap' }, 'illustrative'));
  }

  /* ---------------------------------------------------------------- *
   * dock panel: scene / difference field
   * ---------------------------------------------------------------- */

  function drawDiff(c, D, T) {
    const x = c.x;
    if (!x || !D) return;
    const w = c.w;
    const hh = c.h;
    x.clearRect(0, 0, w, hh);
    const histH = Math.max(8, Math.round(hh * 0.24));
    const titleH = 8;
    const gh = Math.max(6, hh - histH - titleH - 2);
    const gap = 6;
    const gridW = (w - gap) / 2;
    const cw = gridW / DIFF_COLS;
    const ch = gh / DIFF_ROWS;
    // the error blob drifts: same input, local delta
    const bx = (0.5 + 0.42 * Math.sin(T * 0.55)) * DIFF_COLS;
    const by = (0.5 + 0.38 * Math.cos(T * 0.41)) * DIFF_ROWS;
    x.font = '600 5.5px ' + FONT;
    x.textBaseline = 'top';
    for (let side = 0; side < 2; side += 1) {
      const ox = side * (gridW + gap);
      x.fillStyle = '#6b6f78';
      x.fillText(side ? 'IMPLEMENTATION' : 'REFERENCE', ox, 0);
      for (let j = 0; j < DIFF_ROWS; j += 1) {
        for (let i = 0; i < DIFF_COLS; i += 1) {
          const base = D.g[j][i];
          let v = base;
          let err = 0;
          if (side === 1) {
            const dx = i - bx;
            const dy = j - by;
            err = Math.exp(-(dx * dx) / 9 - (dy * dy) / 6);
            v = Math.min(1, base + err * 0.55);
          }
          x.fillStyle = side === 1 && err > 0.35
            ? PINK
            : 'rgba(230,232,236,' + (0.06 + v * 0.5).toFixed(2) + ')';
          x.fillRect(ox + i * cw + 0.5, titleH + 1 + j * ch,
            Math.max(1, cw - 1), Math.max(1, ch - 1));
        }
      }
    }
    const hw = w / HIST_BARS;
    for (let i = 0; i < HIST_BARS; i += 1) {
      const v = D.hist[i] || 0;
      const bh = Math.max(1, v * (histH - 3));
      x.fillStyle = i === HIST_BARS - 1 ? PINK : 'rgba(230,232,236,.3)';
      x.fillRect(i * hw + 0.5, hh - bh, Math.max(1, hw - 1.5), bh);
    }
  }

  function DiffPanel() {
    let D = null;
    let T = 0;
    const mount = () => {
      const g = [];
      for (let j = 0; j < DIFF_ROWS; j += 1) {
        const row = [];
        for (let i = 0; i < DIFF_COLS; i += 1) row.push(0.25 + rnd() * 0.55);
        g.push(row);
      }
      const hist = [];
      for (let i = 0; i < HIST_BARS; i += 1) hist.push(rnd() * 0.8);
      D = { g, hist };
      T = 0;
    };
    const ref = useCanvas(mount, (c, dt) => {
      T += dt;
      if (!D) return;
      for (let i = 0; i < HIST_BARS; i += 1) {
        D.hist[i] = Math.max(0.05, Math.min(1, D.hist[i] + gauss() * 0.05));
      }
      drawDiff(c, D, T);
    });
    return h('div', { className: 'hfx-lab' },
      h('h3', null, 'SCENE / DIFFERENCE FIELD'),
      h('canvas', { ref }),
      h('div', { className: 'cap' }, 'same input · local delta · illustrative'));
  }

  /* ---------------------------------------------------------------- *
   * rack (right rail, 5 rows by default) and dock (bottom right, 2 rows)
   *
   * ADVECTION / PARTICLE SOLVER is off unless advOn=1: it reached up over the
   * session toolbar. mount.js sizes the rail grid from the same switches
   * (--hfx-rack-rows), so always gate both in step.
   * ---------------------------------------------------------------- */

  function Rack(props) {
    const params = props.params || {};
    const rawFeed = params.feedOn == null ? 1 : params.feedOn;
    const showFeed = Number(rawFeed) >= 0.5;
    const showAdv = Number(params.advOn) >= 0.5;
    return h(React.Fragment, null,
      showAdv ? h(AdvPanel, props) : null,
      showFeed ? h(FeedPanel, props) : null,
      h(AgentsPanel, props),
      h(WorkspacePanel, props),
      h(RoutesPanel, props),
      h(IndexPanel, props));
  }

  function Dock(props) {
    return h(React.Fragment, null,
      h(ValPanel, props),
      h(DiffPanel, props));
  }

  return { Rack, Dock };
})();
