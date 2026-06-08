/* Recall — ITEM CARD variants. Exports CardA, CardB, CardC. */
const K = window.RECALL;
const kBy = (id) => K.ITEMS.find((x) => x.id === id);

// shared share-row
function ShareRow({ compact }) {
  const targets = [['message', 'iMessage'], ['mail', 'Email'], ['slack', 'Slack'], ['link', 'Copy']];
  return (
    <div style={{ display: 'flex', gap: compact ? 6 : 8 }}>
      {targets.map(([ic, label]) => (
        <button key={ic} className="rc-btn ghost" title={label}
          style={{ padding: compact ? '6px 8px' : '8px 11px', fontSize: 12.5, gap: 6 }}>
          <Ico name={ic} s={15} />{!compact && label}
        </button>
      ))}
    </div>
  );
}

/* ════════════ A · Editorial card ════════════ */
function CardA() {
  const it = kBy('distribution-era');
  return (
    <div className="rc" style={{ height: '100%', background: 'var(--paper)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 26 }}>
      <div style={{ width: 372, background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
        <div style={{ height: 6, background: K.CATS[it.cat].v }} />
        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <SrcBadge kind={it.src} read={it.read} />
            <Star on={it.starred} size={20} />
          </div>
          <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.18, letterSpacing: '-0.025em', textWrap: 'balance' }}>{it.title}</div>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', textWrap: 'pretty' }}>{it.sum}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
            <FaviconChip domain={it.domain} size={20} />
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{it.domain}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 14, marginTop: 4,
            borderTop: '1px solid var(--line-2)', justifyContent: 'space-between' }}>
            <Cat id={it.cat} />
            <ShareRow compact />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════ B · Dense row (list density) ════════════ */
function DenseRow({ it, sel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
      borderBottom: '1px solid var(--line-2)', background: sel ? 'var(--surface)' : 'transparent',
      boxShadow: sel ? 'var(--shadow-sm), inset 2px 0 0 var(--accent)' : 'none', borderRadius: sel ? 8 : 0 }}>
      <Star on={it.starred} size={17} />
      <span style={{ color: 'var(--ink-3)' }}><SrcIcon kind={it.src} s={15} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 14.5, fontWeight: it.read_state === 'unread' ? 600 : 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            color: it.read_state === 'unread' ? 'var(--ink)' : 'var(--ink-2)' }}>{it.title}</span>
          {it.tabs && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', flex: 'none' }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <Cat id={it.cat} size={7} />
          {it.resources && it.resources.slice(0, 1).map((r, i) => <ResourcePill key={i} r={r} />)}
          {it.tags.slice(0, 2).map((t) => (
            <span key={t} className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>#{t.replace(/\s/g, '-')}</span>
          ))}
        </div>
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', flex: 'none' }}>{K.ED[it.ed]}</span>
      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', width: 48, textAlign: 'right', flex: 'none' }}>
        {it.read ? it.read + ' min' : it.src}</span>
    </div>
  );
}
function CardB() {
  const rows = ['search-as-code', 'headroom', 'anthropic-ipo', 'bedrock', 'distribution-era'].map(kBy);
  return (
    <div className="rc" style={{ height: '100%', background: 'var(--paper)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 22 }}>
      <div style={{ width: 700, background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-md)', overflow: 'hidden', padding: '6px 4px' }}>
        {rows.map((it, i) => <DenseRow key={it.id} it={it} sel={i === 1} />)}
      </div>
    </div>
  );
}

/* ════════════ C · Rich card — why it matters + resources + notes ════════════ */
function CardC() {
  const it = kBy('search-as-code');
  return (
    <div className="rc" style={{ height: '100%', background: 'var(--paper)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 392, background: 'var(--surface)', border: '1px solid var(--line)',
        borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 22px 0', display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}><SrcBadge kind={it.src} read={it.read} /><Cat id={it.cat} showLabel={false} /></div>
            <Star on={it.starred} size={20} />
          </div>
          <div style={{ fontSize: 19.5, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', textWrap: 'balance' }}>{it.title}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)', textWrap: 'pretty' }}>{it.sum}</div>
        </div>

        {/* why it matters */}
        <div style={{ margin: '16px 22px 0', padding: '12px 14px', background: 'var(--accent-soft)',
          border: '1px solid var(--accent-line)', borderRadius: 'var(--r-md)', display: 'flex', gap: 10 }}>
          <span style={{ color: 'var(--accent)', flex: 'none', paddingTop: 1 }}><Ico name="spark" s={16} /></span>
          <div>
            <div className="mono" style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', letterSpacing: '.05em', marginBottom: 3 }}>WHY THIS MATTERS TO YOU</div>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink)' }}>{it.why}</div>
          </div>
        </div>

        {/* extracted resources */}
        <div style={{ padding: '16px 22px 0' }}>
          <div className="mono" style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-4)', letterSpacing: '.05em', marginBottom: 9 }}>LINKED RESOURCES</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {it.resources.map((r, i) => <ResourcePill key={i} r={r} />)}
          </div>
        </div>

        {/* tags / notes */}
        <div style={{ padding: '16px 22px 0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {it.tags.map((t) => (
              <span key={t} className="rc-chip" style={{ fontSize: 11.5, padding: '4px 10px', color: 'var(--ink-3)' }}>#{t.replace(/\s/g, '-')}</span>
            ))}
            <span className="rc-chip" style={{ fontSize: 11.5, padding: '4px 10px', borderStyle: 'dashed', color: 'var(--ink-3)' }}><Ico name="plus" s={12} /> tag</span>
          </div>
        </div>

        {/* footer actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 22px 18px', marginTop: 16,
          borderTop: '1px solid var(--line-2)', justifyContent: 'space-between' }}>
          <button className="rc-btn primary" style={{ fontSize: 13, padding: '9px 16px' }}>Open original <Ico name="arrow" s={15} /></button>
          <ShareRow compact />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CardA, CardB, CardC });
