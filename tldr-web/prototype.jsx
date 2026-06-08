/* Recall — full interactive prototype. Defines window.RecallApp.
   Single file so all components share scope; atoms pulled from window. */
const { useState, useEffect, useRef, useMemo, useCallback } = React;
const { Ico, Star, Logo, SrcBadge, SrcIcon, FaviconChip, ResourcePill } = window;
const { ITEMS, CATS, ED, ED_META, CAT_ORDER } = window.RECALL;

const LS_KEY = 'recall-app-v1';
const loadState = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const STOP = new Set(['the','and','for','with','that','this','are','all','give','show','what','articles','article','related','powered','about','from','your','non','not','only','any']);
const SRC_NAME = { repo:'GitHub repo', website:'website', substack:'Substack', paper:'paper', article:'read' };

// ── shared context ──
const AppCtx = React.createContext(null);
const useApp = () => React.useContext(AppCtx);

// ─────────────────────────────────────────────
// Top bar — present on every view
// ─────────────────────────────────────────────
function IconBtn({ name, on, badge, onClick, title }) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      style={{ position: 'relative', width: 38, height: 38, borderRadius: 9, border: '1px solid ' + (on ? 'var(--ink)' : 'transparent'),
        background: on ? 'var(--ink)' : 'transparent', color: on ? 'var(--paper)' : 'var(--ink-2)',
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s, color .12s, border-color .12s' }}
      onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
      <Ico name={name} s={19} />
      {badge ? <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 999,
        background: 'var(--accent)', border: '1.5px solid var(--paper)' }} /> : null}
    </button>
  );
}

function TopBar() {
  const a = useApp();
  const Tab = ({ id, label }) => (
    <button onClick={() => a.go(id)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', padding: '6px 2px',
        fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em', position: 'relative',
        color: a.view === id ? 'var(--ink)' : 'var(--ink-3)', transition: 'color .12s' }}>
      {label}
      <span style={{ position: 'absolute', left: 0, right: 0, bottom: -19, height: 2, borderRadius: 2,
        background: a.view === id ? 'var(--ink)' : 'transparent' }} />
    </button>
  );
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'color-mix(in oklch, var(--paper) 86%, transparent)',
      backdropFilter: 'saturate(1.4) blur(10px)', borderBottom: '1px solid var(--line)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', height: 60, padding: '0 28px', display: 'flex', alignItems: 'center', gap: 26 }}>
        <button onClick={() => a.go('editorial')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <Logo size={17} />
        </button>
        <nav style={{ display: 'flex', gap: 22 }}>
          <Tab id="editorial" label="Editorial" />
          <Tab id="library" label="Library" />
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IconBtn name="search" title="Smart search" on={a.view === 'search'} onClick={() => a.go('search')} />
          <IconBtn name="filter" title="Filters" on={a.filterOpen} badge={a.filterCount > 0} onClick={a.toggleFilter} />
          <div style={{ width: 1, height: 22, background: 'var(--line)', margin: '0 6px' }} />
          <IconBtn name={a.dark ? 'sun' : 'moon'} title="Toggle theme" onClick={a.toggleTheme} />
          <IconBtn name="user" title="Account & admin" onClick={() => {}} />
        </div>
      </div>
      {a.filterOpen && <FilterPanel />}
    </header>
  );
}

// ─────────────────────────────────────────────
// Filter panel — applies to Library + Search
// ─────────────────────────────────────────────
function FilterPanel() {
  const a = useApp();
  const f = a.filters;
  const Group = ({ label, keys, dim }) => (
    <div style={{ minWidth: 0 }}>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '.05em', marginBottom: 9, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {keys.map(([val, txt]) => {
          const on = f[dim].includes(val);
          return <button key={val} className={'rc-chip' + (on ? ' on accent' : '')} style={{ fontSize: 12.5, padding: '5px 12px' }}
            onClick={() => a.toggleFilterVal(dim, val)}>{txt}</button>;
        })}
      </div>
    </div>
  );
  return (
    <div style={{ borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 28px', display: 'flex', gap: 40, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Group label="Edition" dim="editions" keys={Object.keys(ED_META).map((k) => [k, ED_META[k].name])} />
        <Group label="Source" dim="sources" keys={[['article', 'Articles'], ['repo', 'GitHub'], ['paper', 'Papers'], ['substack', 'Substack'], ['website', 'Sites']]} />
        <Group label="Category" dim="cats" keys={CAT_ORDER.filter((c) => CATS[c]).map((c) => [c, CATS[c].label])} />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className={'rc-chip' + (f.starredOnly ? ' on' : '')} style={{ fontSize: 12.5, padding: '6px 13px' }}
            onClick={a.toggleStarredOnly}><Ico name="star" s={14} /> Starred only</button>
          {a.filterCount > 0 && <button onClick={a.clearFilters} style={{ background: 'none', border: 'none', cursor: 'pointer',
            font: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--accent)' }}>Clear all</button>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Share popover
// ─────────────────────────────────────────────
function SharePop({ onClose }) {
  const targets = [['message', 'iMessage'], ['mail', 'Email'], ['slack', 'Slack'], ['link', 'Copy link']];
  const [copied, setCopied] = useState(null);
  useEffect(() => {
    const off = (e) => { if (!e.target.closest('[data-share]')) onClose(); };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, []);
  return (
    <div data-share style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 30,
      background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-lg)',
      padding: 5, minWidth: 168 }}>
      {targets.map(([ic, label]) => (
        <button key={ic} onClick={() => { if (ic === 'link') { setCopied(true); setTimeout(onClose, 650); } else onClose(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '9px 11px', border: 'none',
            background: 'transparent', borderRadius: 7, cursor: 'pointer', font: 'inherit', fontSize: 13.5, fontWeight: 500,
            color: 'var(--ink)', textAlign: 'left' }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
          <span style={{ color: 'var(--ink-3)' }}><Ico name={copied && ic === 'link' ? 'check' : ic} s={17} /></span>
          {copied && ic === 'link' ? 'Copied!' : label}
        </button>
      ))}
    </div>
  );
}

// star + share action cluster
function Actions({ it, size = 19 }) {
  const a = useApp();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
      <Star on={a.isStarred(it.id)} size={size} onClick={() => a.toggleStar(it.id)} />
      <div style={{ position: 'relative' }}>
        <button onClick={() => a.setShare(a.shareId === it.id ? null : it.id)} aria-label="share"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--ink-4)',
            display: 'inline-flex', transition: 'color .12s' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--ink-2)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--ink-4)'}>
          <Ico name="share" s={size - 2} />
        </button>
        {a.shareId === it.id && <SharePop onClose={() => a.setShare(null)} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Article item — shared by Editorial + Search (clean header + body)
// ─────────────────────────────────────────────
function ArticleItem({ it }) {
  const href = 'https://' + it.domain;
  return (
    <article style={{ padding: '22px 0', borderBottom: '1px solid var(--line-2)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap', marginBottom: 9 }}>
        <a href={href} target="_blank" rel="noreferrer"
          style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.24, color: 'var(--ink)',
            textDecoration: 'none', textWrap: 'balance' }}
          onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
          onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}>{it.title}</a>
        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
          {it.read ? '(' + it.read + ' min read)' : '(' + SRC_NAME[it.src] + ')'}</span>
      </div>
      <p style={{ fontSize: 16, lineHeight: 1.62, color: 'var(--ink-2)', margin: '0 0 14px', maxWidth: 648, textWrap: 'pretty' }}>{it.sum}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
          <FaviconChip domain={it.domain} size={18} />
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)' }}>{it.domain}</span>
          {it.resources && it.resources.map((r, i) => <ResourcePill key={i} r={r} />)}
        </div>
        <Actions it={it} />
      </div>
    </article>
  );
}

// category section header — typographic, no color
function SectionHead({ catId }) {
  return (
    <div style={{ margin: '40px 0 2px', paddingBottom: 8, borderBottom: '1.5px solid var(--ink)' }}>
      <h2 className="mono" style={{ margin: 0, fontSize: 13.5, fontWeight: 600, letterSpacing: '.1em',
        textTransform: 'uppercase', color: 'var(--ink)' }}>{CATS[catId].label}</h2>
    </div>
  );
}

// flagship first
const ED_ORDER = ['tldr', 'founders', 'ai'];

// light prev/next issue control
function IssueNav({ dir }) {
  const prev = dir === 'prev';
  return (
    <button title={prev ? 'Previous issue' : 'Next issue'} aria-label={prev ? 'Previous issue' : 'Next issue'}
      style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer',
        color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'background .12s, color .12s' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--ink)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-3)'; }}>
      <span style={{ display: 'inline-flex', transform: prev ? 'rotate(180deg)' : 'none' }}><Ico name="chevron" s={18} sw={1.9} /></span>
    </button>
  );
}

// ─────────────────────────────────────────────
// Editorial — landing page / entrant
// ─────────────────────────────────────────────
function EditorialView() {
  const a = useApp();
  const ed = a.edition;
  const meta = ED_META[ed];
  const items = useMemo(() => ITEMS.filter((x) => x.ed === ed), [ed]);
  const grouped = useMemo(() => CAT_ORDER.map((c) => [c, items.filter((x) => x.cat === c)]).filter(([, l]) => l.length), [items]);
  const total = items.reduce((s, x) => s + (x.read || 3), 0);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 60, padding: '40px 0 90px' }}>

        {/* vertical edition list — left-aligned with the logo, tops aligned with body */}
        <nav style={{ width: 168, flex: 'none', position: 'sticky', top: 84,
          display: 'flex', flexDirection: 'column', gap: 2 }}>
          {ED_ORDER.map((k) => {
            const on = ed === k;
            return (
              <button key={k} onClick={() => a.setEdition(k)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left',
                  padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 2,
                  color: on ? 'var(--ink)' : 'var(--ink-4)', transition: 'color .12s' }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = 'var(--ink-2)'; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = 'var(--ink-4)'; }}>
                <span style={{ fontSize: 17, fontWeight: on ? 700 : 600, letterSpacing: '-0.02em',
                  color: on ? 'var(--accent)' : 'inherit' }}>{ED_META[k].name}</span>
              </button>
            );
          })}
        </nav>

        {/* body — top aligns with the first edition in the list */}
        <div style={{ width: 668, maxWidth: '100%' }}>
          {/* masthead */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
            <div className="mono" style={{ fontSize: 12.5, color: 'var(--ink-4)', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>
              {meta.date.toUpperCase()} · ISSUE {meta.issue}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <IssueNav dir="prev" />
              <IssueNav dir="next" />
            </div>
          </div>
          <h1 style={{ fontSize: 50, fontWeight: 800, letterSpacing: '-0.045em', margin: '0 0 16px', lineHeight: 1 }}>{meta.name}</h1>
          <p style={{ fontSize: 19.5, lineHeight: 1.5, color: 'var(--ink-2)', margin: 0, fontWeight: 500, textWrap: 'pretty', maxWidth: 600 }}>{meta.sub}</p>

          {grouped.map(([c, list]) => (
            <section key={c}>
              <SectionHead catId={c} />
              {list.map((it) => <ArticleItem key={it.id} it={it} />)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// shared filtering
// ─────────────────────────────────────────────
function applyFilters(pool, f) {
  return pool.filter((it) => {
    if (f.editions.length && !f.editions.includes(it.ed)) return false;
    if (f.sources.length && !f.sources.includes(it.src)) return false;
    if (f.cats.length && !f.cats.includes(it.cat)) return false;
    if (f.starredOnly && !f._starred.has(it.id)) return false;
    return true;
  });
}
function cyclePool(pool, n) {
  if (!pool.length) return [];
  const out = [];
  for (let i = 0; out.length < n; i++) {
    const base = pool[i % pool.length];
    const cyc = Math.floor(i / pool.length);
    out.push({ it: base, key: base.id + (cyc ? '#' + cyc : '') });
  }
  return out;
}

// infinite-scroll hook
function useInfinite(initial, step, max) {
  const [n, setN] = useState(initial);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((es) => {
      if (es[0].isIntersecting) setN((v) => Math.min(max, v + step));
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [max, step]);
  return [n, ref, setN];
}

// ─────────────────────────────────────────────
// Library — dense, no left rail, compact↔expanded, infinite scroll
// ─────────────────────────────────────────────
function LibraryRow({ it, expanded }) {
  const a = useApp();
  const href = 'https://' + it.domain;
  const unread = it.read_state === 'unread';
  return (
    <div style={{ display: 'flex', gap: 16, padding: expanded ? '18px 8px' : '0 8px', minHeight: expanded ? 0 : 48,
      alignItems: expanded ? 'flex-start' : 'center', borderBottom: '1px solid var(--line-2)' }}>
      <div style={{ paddingTop: expanded ? 2 : 0 }}><Star on={a.isStarred(it.id)} size={16} onClick={() => a.toggleStar(it.id)} /></div>
      <span style={{ color: 'var(--ink-4)', flex: 'none', paddingTop: expanded ? 3 : 0 }}><SrcIcon kind={it.src} s={15} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <a href={href} target="_blank" rel="noreferrer"
            style={{ fontSize: expanded ? 16.5 : 14, fontWeight: unread ? 600 : 500, color: unread ? 'var(--ink)' : 'var(--ink-2)',
              textDecoration: 'none', letterSpacing: '-0.01em', whiteSpace: expanded ? 'normal' : 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', textWrap: expanded ? 'balance' : 'nowrap' }}
            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}>{it.title}</a>
          {it.tabs && !expanded && <span title="open tab" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', flex: 'none' }} />}
        </div>
        {expanded && (
          <>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', margin: '7px 0 10px', maxWidth: 680, textWrap: 'pretty' }}>{it.sum}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{it.domain}</span>
              {it.resources && it.resources.slice(0, 1).map((r, i) => <ResourcePill key={i} r={r} />)}
            </div>
          </>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none', paddingTop: expanded ? 2 : 0 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', minWidth: 96, textAlign: 'right' }}>{ED[it.ed]}</span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', minWidth: 50, textAlign: 'right' }}>{it.read ? it.read + ' min' : it.src}</span>
        {expanded && <Actions it={it} size={17} />}
      </div>
    </div>
  );
}

function LibraryView() {
  const a = useApp();
  const expanded = a.density === 'expanded';
  const pool = useMemo(() => applyFilters(ITEMS, { ...a.filters, _starred: a.starred }), [a.filters, a.starred]);
  const [n, sentinel, setN] = useInfinite(expanded ? 8 : 16, expanded ? 6 : 12, 140);
  useEffect(() => { setN(expanded ? 8 : 16); }, [expanded, a.filters, a.starred]);
  const rows = cyclePool(pool, Math.min(n, pool.length ? 140 : 0));
  const more = pool.length > 0;

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, padding: '30px 8px 14px', borderBottom: '1px solid var(--line)' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>Library</h1>
          <div style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 4 }}>
            <span className="mono" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>1,204</span> saved
            {a.filterCount > 0 && <span> · {pool.length} match{pool.length === 1 ? '' : 'es'} filters</span>}</div>
        </div>
        <div style={{ flex: 1 }} />
        {/* density toggle */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: 3 }}>
          {[['compact', 'rows', 'Titles'], ['expanded', 'library', 'Titles + TLDR']].map(([k, ic, label]) => (
            <button key={k} onClick={() => a.setDensity(k)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, border: 'none', cursor: 'pointer', font: 'inherit',
                fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 7,
                background: a.density === k ? 'var(--surface)' : 'transparent', boxShadow: a.density === k ? 'var(--shadow-sm)' : 'none',
                color: a.density === k ? 'var(--ink)' : 'var(--ink-3)' }}>
              <Ico name={ic} s={15} /> {label}</button>
          ))}
        </div>
      </div>

      {!expanded && (
        <div style={{ display: 'flex', gap: 16, padding: '0 8px', height: 34, alignItems: 'center',
          fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase',
          color: 'var(--ink-4)', borderBottom: '1px solid var(--line)' }}>
          <span style={{ width: 16 }}></span><span style={{ width: 15 }}></span>
          <span style={{ flex: 1 }}>Title</span>
          <span style={{ minWidth: 96, textAlign: 'right' }}>Edition</span>
          <span style={{ minWidth: 50, textAlign: 'right' }}>Length</span>
        </div>
      )}

      {pool.length === 0 ? (
        <div style={{ padding: '70px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14.5 }}>
          No saved items match these filters. <button onClick={a.clearFilters} style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'var(--accent)', fontWeight: 600 }}>Clear filters</button>
        </div>
      ) : (
        <>
          <div>{rows.map(({ it, key }) => <LibraryRow key={key} it={it} expanded={expanded} />)}</div>
          {more && <div ref={sentinel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '28px 0 70px', color: 'var(--ink-4)', fontSize: 13 }}>
            <span className="rc-spin" /> Loading more</div>}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Smart Search — results only, reuse ArticleItem, infinite scroll
// ─────────────────────────────────────────────
function scoreItem(it, terms, negs) {
  const hay = (it.title + ' ' + it.sum + ' ' + it.tags.join(' ') + ' ' + CATS[it.cat].label + ' ' + (it.resources || []).map((r) => r.label + ' ' + (r.meta || '')).join(' ')).toLowerCase();
  for (const ng of negs) if (hay.includes(ng)) return -1;
  let s = 0;
  for (const t of terms) {
    if (it.title.toLowerCase().includes(t)) s += 3;
    if (it.tags.some((tg) => tg.includes(t))) s += 3;
    else if (hay.includes(t)) s += 1;
  }
  return s;
}
function runSearch(q, f, starred) {
  const ql = q.toLowerCase();
  const negs = [];
  ql.replace(/\bnon-?\s?(\w+)|\bnot\s+(\w+)|\bwithout\s+(\w+)/g, (m, a1, b, c) => { negs.push((a1 || b || c)); return m; });
  const negStems = negs.map((x) => x.replace(/s$/, ''));
  const terms = ql.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w) && !negs.includes(w));
  let pool = applyFilters(ITEMS, { ...f, _starred: starred });
  const scored = pool.map((it) => [it, scoreItem(it, terms, negStems)]).filter(([, s]) => s >= 0);
  scored.sort((x, y) => y[1] - x[1] || (y[0].starred - x[0].starred));
  const any = scored.some(([, s]) => s > 0);
  return (any ? scored.filter(([, s]) => s > 0) : scored).map(([it]) => it);
}

const SUGGEST = [
  'non-agent articles related to web crawling',
  'github repos with a skills directory for marketing',
  'everything about IPOs and going public',
  'open-weights model releases I haven\u2019t read',
];

function SearchView() {
  const a = useApp();
  const [q, setQ] = useState(a.query || '');
  const [submitted, setSubmitted] = useState(a.query || '');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);
  const results = useMemo(() => submitted.trim() ? runSearch(submitted, { ...a.filters, _starred: a.starred }, a.starred) : [], [submitted, a.filters, a.starred]);
  const [n, sentinel, setN] = useInfinite(8, 6, 120);
  useEffect(() => { setN(8); }, [submitted, a.filters]);
  const shown = results.slice(0, n);

  const submit = (val) => { const v = val ?? q; setQ(v); setSubmitted(v); a.setQuery(v); };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '0 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: 700, maxWidth: '100%', padding: '38px 0 90px' }}>
          {/* input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--surface)', border: '1.5px solid var(--ink)',
            borderRadius: 14, padding: '15px 18px', boxShadow: 'var(--shadow-md)' }}>
            <span style={{ color: 'var(--accent)' }}><Ico name="spark" s={21} /></span>
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              placeholder="Ask your library in plain English…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', font: 'inherit',
                fontSize: 16.5, fontWeight: 500, color: 'var(--ink)' }} />
            {q && <button onClick={() => { setQ(''); setSubmitted(''); a.setQuery(''); inputRef.current.focus(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', display: 'inline-flex' }}><Ico name="x" s={18} /></button>}
            <button className="rc-btn primary" onClick={() => submit()} style={{ padding: '9px', borderRadius: 10, width: 38, height: 38 }}><Ico name="arrow" s={18} /></button>
          </div>

          {!submitted.trim() ? (
            <div style={{ marginTop: 26 }}>
              <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '.05em', marginBottom: 12 }}>TRY ASKING</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {SUGGEST.map((s) => (
                  <button key={s} onClick={() => submit(s)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 6px', border: 'none', borderBottom: '1px solid var(--line-2)',
                      background: 'transparent', cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'var(--ink-2)', fontSize: 15.5 }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--ink)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--ink-2)'}>
                    <span style={{ color: 'var(--ink-4)' }}><Ico name="search" s={16} /></span>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{results.length} result{results.length === 1 ? '' : 's'}</span>
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>ranked by meaning across your library</span>
              </div>
              {results.length === 0 ? (
                <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14.5 }}>Nothing matched. Try fewer or different words.</div>
              ) : (
                <>
                  {shown.map((it) => <ArticleItem key={it.id} it={it} />)}
                  {n < results.length && <div ref={sentinel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '24px 0', color: 'var(--ink-4)', fontSize: 13 }}><span className="rc-spin" /> Loading more</div>}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// App root — state, persistence, routing
// ─────────────────────────────────────────────
function App() {
  const saved = loadState();
  const [dark, setDark] = useState(saved.dark ?? false);
  const [view, setView] = useState(saved.view || 'editorial');
  const [edition, setEdition] = useState(saved.edition || 'tldr');
  const [density, setDensity] = useState(saved.density || 'compact');
  const [starred, setStarred] = useState(() => new Set(saved.starred || ITEMS.filter((x) => x.starred).map((x) => x.id)));
  const [query, setQuery] = useState(saved.query || '');
  const [filters, setFilters] = useState(saved.filters || { editions: [], sources: [], cats: [], starredOnly: false });
  const [filterOpen, setFilterOpen] = useState(false);
  const [shareId, setShareId] = useState(null);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ dark, view, edition, density, query, filters, starred: [...starred] }));
  }, [dark, view, edition, density, query, filters, starred]);
  useEffect(() => { document.body.style.background = dark ? '#191512' : '#f7f6f2'; }, [dark]);

  const filterCount = filters.editions.length + filters.sources.length + filters.cats.length + (filters.starredOnly ? 1 : 0);

  const api = {
    dark, view, edition, density, query, filters, filterOpen, shareId, starred, filterCount,
    go: (v) => { setView(v); setShareId(null); window.scrollTo({ top: 0 }); },
    toggleTheme: () => setDark((d) => !d),
    setEdition: (e) => { setEdition(e); window.scrollTo({ top: 0 }); },
    setDensity,
    setQuery,
    isStarred: (id) => starred.has(id),
    toggleStar: (id) => setStarred((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }),
    setShare: setShareId,
    toggleFilter: () => setFilterOpen((o) => !o),
    toggleFilterVal: (dim, val) => setFilters((f) => ({ ...f, [dim]: f[dim].includes(val) ? f[dim].filter((x) => x !== val) : [...f[dim], val] })),
    toggleStarredOnly: () => setFilters((f) => ({ ...f, starredOnly: !f.starredOnly })),
    clearFilters: () => setFilters({ editions: [], sources: [], cats: [], starredOnly: false }),
  };

  return (
    <AppCtx.Provider value={api}>
      <div className={'rc app' + (dark ? ' dark' : '')} style={{ minHeight: '100vh', background: 'var(--paper)' }}>
        <TopBar />
        <main>
          {view === 'editorial' && <EditorialView />}
          {view === 'library' && <LibraryView />}
          {view === 'search' && <SearchView />}
        </main>
      </div>
    </AppCtx.Provider>
  );
}

window.RecallApp = App;
