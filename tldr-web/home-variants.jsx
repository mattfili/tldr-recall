/* Recall — HOME / LIBRARY variants. Exports HomeA, HomeB, HomeC to window. */
const { ITEMS, CATS, COLLECTIONS, ED } = window.RECALL;
const byId = (id) => ITEMS.find((x) => x.id === id);

// shared left rail used by A & C
function Rail({ active = 'library' }) {
  const nav = [
    ['library', 'Library', 'library'],
    ['inbox', "Today's issues", 'inbox'],
    ['starred', 'Starred', 'star'],
    ['search', 'Smart search', 'spark'],
  ];
  return (
    <div style={{ width: 208, flex: 'none', borderRight: '1px solid var(--line)', background: 'var(--paper)',
      padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ padding: '2px 8px 18px' }}><Logo size={17} /></div>
      {nav.map(([k, label, ic]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8,
          fontSize: 14, fontWeight: 500, cursor: 'pointer',
          background: active === k ? 'var(--ink)' : 'transparent',
          color: active === k ? 'var(--paper)' : 'var(--ink-2)' }}>
          <Ico name={ic} s={17} /> {label}
        </div>
      ))}
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-4)', letterSpacing: '.06em',
        textTransform: 'uppercase', padding: '20px 10px 8px', fontFamily: 'var(--mono)' }}>Smart collections</div>
      {COLLECTIONS.slice(0, 4).map((c) => (
        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8,
          fontSize: 13.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
          <span className="rc-dot" style={{ background: c.v }} /> {c.label}
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)' }}>{c.count}</span>
        </div>
      ))}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
        borderTop: '1px solid var(--line)', paddingTop: 14 }}>
        <span style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--accent)', color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>M</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>Matthew F.</span>
      </div>
    </div>
  );
}

// compact card used in grids
function MiniCard({ it }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', background: 'var(--surface)',
      padding: 16, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SrcBadge kind={it.src} read={it.read} />
        <Star on={it.starred} size={17} />
      </div>
      <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.01em',
        textWrap: 'pretty', color: 'var(--ink)' }}>{it.title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{it.sum}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto', paddingTop: 4 }}>
        <Cat id={it.cat} showLabel={false} />
        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{CATS[it.cat].label}</span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)' }}>{ED[it.ed]}</span>
      </div>
    </div>
  );
}

/* ════════════ A · Search-forward dashboard ════════════ */
function HomeA() {
  const recent = ['search-as-code', 'distribution-era', 'headroom', 'anthropic-ipo', 'qwen', 'more-tokens'].map(byId);
  return (
    <div className="rc" style={{ display: 'flex', height: '100%', background: 'var(--surface)' }}>
      <Rail active="library" />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '46px 52px 30px', background: 'linear-gradient(180deg,var(--paper),var(--surface))',
          borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--mono)',
            letterSpacing: '.04em', marginBottom: 14 }}>1,204 saved · 38 unread</div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 22 }}>
            Recall anything you’ve read or saved.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)',
            border: '1.5px solid var(--ink)', borderRadius: 999, padding: '13px 18px', maxWidth: 660,
            boxShadow: 'var(--shadow-md)' }}>
            <span style={{ color: 'var(--accent)' }}><Ico name="spark" s={19} /></span>
            <span style={{ fontSize: 15.5, color: 'var(--ink-3)' }}>Ask in plain English… “non-agent articles about web crawling”</span>
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)',
              border: '1px solid var(--line)', borderRadius: 5, padding: '2px 6px' }}>⌘K</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {COLLECTIONS.map((c) => (
              <span key={c.id} className="rc-chip" style={{ fontSize: 13, padding: '7px 13px' }}>
                <span className="rc-dot" style={{ background: c.v }} /> {c.label}
                <span className="mono" style={{ color: 'var(--ink-4)', fontSize: 11 }}>{c.count}</span>
              </span>
            ))}
          </div>
        </div>
        <div style={{ padding: '26px 52px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>Recently saved</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="rc-chip on" style={{ fontSize: 12.5, padding: '6px 12px' }}>All</span>
              <span className="rc-chip" style={{ fontSize: 12.5, padding: '6px 12px' }}>Unread</span>
              <span className="rc-chip" style={{ fontSize: 12.5, padding: '6px 12px' }}><Ico name="grid" s={14} /></span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
            {recent.map((it) => <MiniCard key={it.id} it={it} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════ B · Triage inbox (today's issues) ════════════ */
function TriageRow({ it }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 0',
      borderBottom: '1px solid var(--line-2)' }}>
      <div style={{ paddingTop: 2 }}><Cat id={it.cat} showLabel={false} size={9} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
          <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em' }}>{it.title}</span>
          {it.tabs && <span className="mono" style={{ fontSize: 10.5, color: 'var(--accent)', background: 'var(--accent-soft)',
            border: '1px solid var(--accent-line)', borderRadius: 5, padding: '1px 6px' }}>open tab</span>}
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--ink-2)', maxWidth: 620, textWrap: 'pretty' }}>{it.sum}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
          <SrcBadge kind={it.src} read={it.read} />
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{CATS[it.cat].label}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button className="rc-btn ghost" style={{ padding: '7px 9px' }}><Ico name="check" s={16} /></button>
        <button className="rc-btn ghost" style={{ padding: '7px 9px' }}><Ico name="tag" s={16} /></button>
        <Star on={it.starred} size={19} />
      </div>
    </div>
  );
}
function HomeB() {
  const today = ['nvidia-pcs', 'anthropic-ipo', 'search-as-code', 'qwen', 'video-agents', 'openai-aws'].map(byId);
  return (
    <div className="rc" style={{ height: '100%', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 40px',
        borderBottom: '1px solid var(--line)', background: 'var(--paper)' }}>
        <Logo size={17} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--surface)',
          border: '1px solid var(--line)', borderRadius: 999, padding: '8px 14px', width: 320, color: 'var(--ink-3)' }}>
          <Ico name="spark" s={16} /><span style={{ fontSize: 13.5 }}>Ask or search…</span>
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 11 }}>⌘K</span>
        </div>
        <button className="rc-btn ghost" style={{ padding: '8px 11px' }}><Ico name="library" s={17} /></button>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', padding: '0 40px' }}>
        <div style={{ width: '100%', maxWidth: 820, padding: '30px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>To triage</div>
              <div style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 3 }}>
                3 issues · Mon Jun 1 – Tue Jun 2 · <span style={{ color: 'var(--ink-2)' }}>6 items left</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="rc-btn ghost" style={{ fontSize: 13, padding: '8px 13px' }}>Skip all</button>
              <button className="rc-btn primary" style={{ fontSize: 13, padding: '8px 14px' }}><Ico name="check" s={15} /> Save & next</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, margin: '16px 0 6px' }}>
            {['TLDR', 'TLDR AI', 'TLDR Founders'].map((e, i) => (
              <span key={e} className={'rc-chip' + (i === 0 ? ' on' : '')} style={{ fontSize: 12.5, padding: '6px 13px' }}>{e}</span>
            ))}
          </div>
          {today.map((it) => <TriageRow key={it.id} it={it} />)}
        </div>
      </div>
    </div>
  );
}

/* ════════════ C · Dense library (keyboard-driven table) ════════════ */
function LibRow({ it, sel }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 150px 96px 84px 64px', alignItems: 'center',
      gap: 14, padding: '0 18px', height: 46, borderBottom: '1px solid var(--line-2)',
      background: sel ? 'var(--accent-soft)' : 'transparent',
      boxShadow: sel ? 'inset 2px 0 0 var(--accent)' : 'none' }}>
      <Star on={it.starred} size={15} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
        <span style={{ color: 'var(--ink-3)' }}><SrcIcon kind={it.src} s={13} /></span>
        <span style={{ fontSize: 13.5, fontWeight: it.read_state === 'unread' ? 600 : 500,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: it.read_state === 'unread' ? 'var(--ink)' : 'var(--ink-2)' }}>{it.title}</span>
        {it.tabs && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', flex: 'none' }} />}
      </div>
      <div style={{ overflow: 'hidden' }}><Cat id={it.cat} /></div>
      <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{ED[it.ed]}</span>
      <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{it.read ? it.read + ' min' : SRC_LABEL[it.src]}</span>
      <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{SRC_LABEL[it.src]}</span>
    </div>
  );
}
const SRC_LABEL = { repo:'repo', website:'site', substack:'substack', paper:'paper', article:'read' };
function HomeC() {
  return (
    <div className="rc" style={{ display: 'flex', height: '100%', background: 'var(--surface)' }}>
      <Rail active="library" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px',
          borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>Library</div>
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-4)' }}>1,204</span>
          <div style={{ flex: 1 }} />
          <span className="rc-chip on accent" style={{ fontSize: 12, padding: '6px 11px' }}><Ico name="filter" s={13} /> 2 filters</span>
          <span className="rc-chip" style={{ fontSize: 12, padding: '6px 11px' }}>repo · unread</span>
          <button className="rc-btn ghost" style={{ padding: '6px 9px' }}><Ico name="sort" s={15} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 150px 96px 84px 64px', gap: 14,
          padding: '0 18px', height: 34, alignItems: 'center', borderBottom: '1px solid var(--line)',
          fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em',
          textTransform: 'uppercase', color: 'var(--ink-4)' }}>
          <span></span><span>Title</span><span>Category</span><span>Edition</span><span>Length</span><span>Type</span>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {ITEMS.map((it, i) => <LibRow key={it.id} it={it} sel={i === 3} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 18px',
          borderTop: '1px solid var(--line)', background: 'var(--paper)', fontSize: 11.5, color: 'var(--ink-3)' }}>
          {[['\u2191\u2193', 'navigate'], ['S', 'star'], ['E', 'archive'], ['\u2318K', 'search'], ['\u21B5', 'open']].map(([k, l]) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="mono" style={{ border: '1px solid var(--line)', borderRadius: 4, padding: '1px 6px',
                background: 'var(--surface)', fontSize: 11 }}>{k}</span>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HomeA, HomeB, HomeC });
