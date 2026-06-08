/* Recall — SMART SEARCH variants. Exports SearchA, SearchB, SearchC. */
const S = window.RECALL;
const sBy = (id) => S.ITEMS.find((x) => x.id === id);

// result row with relevance bar + match reason
function ResultRow({ it, score, reason }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '15px 0', borderBottom: '1px solid var(--line-2)' }}>
      <div style={{ width: 40, flex: 'none', paddingTop: 3 }}>
        <div className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{score}</div>
        <div style={{ width: 34, height: 4, borderRadius: 999, background: 'var(--line)', marginTop: 5, overflow: 'hidden' }}>
          <div style={{ width: score + '%', height: '100%', background: 'var(--accent)' }} /></div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{it.title}</span>
          <Star on={it.starred} size={16} />
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)', maxWidth: 640, textWrap: 'pretty' }}>{it.sum}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
          <SrcBadge kind={it.src} read={it.read} />
          <Cat id={it.cat} />
          {reason && <span style={{ fontSize: 12, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Ico name="spark" s={13} /> {reason}</span>}
        </div>
      </div>
    </div>
  );
}

/* ════════════ A · Filter-chip search (parsed → editable chips) ════════════ */
function SearchA() {
  const res = [
    [sBy('multitenancy'), 94, 'web infra, no agents'],
    [sBy('search-as-code'), 71, 'retrieval pipelines'],
    [sBy('bedrock'), 44, 'tangential · pipelines'],
  ];
  return (
    <div className="rc" style={{ height: '100%', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '30px 56px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)',
          border: '1.5px solid var(--ink)', borderRadius: 14, padding: '14px 18px', boxShadow: 'var(--shadow-md)' }}>
          <span style={{ color: 'var(--accent)' }}><Ico name="spark" s={20} /></span>
          <span style={{ fontSize: 16, fontWeight: 500 }}>non-agent articles related to web crawling</span>
          <span style={{ marginLeft: 'auto', width: 2, height: 22, background: 'var(--accent)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '.04em' }}>UNDERSTOOD AS</span>
          <span className="rc-chip on accent" style={{ fontSize: 13, padding: '7px 13px' }}>topic: web crawling</span>
          <span className="rc-chip" style={{ fontSize: 13, padding: '7px 13px', color: 'var(--c-ai)', borderColor: 'var(--c-ai)' }}>
            <span style={{ fontWeight: 700 }}>−</span> exclude: AI agents</span>
          <span className="rc-chip" style={{ fontSize: 13, padding: '7px 13px' }}>type: article</span>
          <span className="rc-chip" style={{ fontSize: 13, padding: '7px 13px', borderStyle: 'dashed', color: 'var(--ink-3)' }}>
            <Ico name="plus" s={13} /> add filter</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, paddingBottom: 14, borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>3 results</span>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>across 1,204 saved · ranked by meaning</span>
          <div style={{ flex: 1 }} />
          <span className="rc-chip" style={{ fontSize: 12.5, padding: '6px 12px' }}><Ico name="sort" s={14} /> Relevance</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '6px 56px 0' }}>
        {res.map(([it, sc, r]) => <ResultRow key={it.id} it={it} score={sc} reason={r} />)}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '18px 0', color: 'var(--ink-3)', fontSize: 13 }}>
          <Ico name="spark" s={15} />
          <span>Excluded <b style={{ color: 'var(--ink-2)' }}>14 agent-related</b> matches. <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Show anyway</span></span>
        </div>
      </div>
    </div>
  );
}

/* ════════════ B · Conversational answer + citations ════════════ */
function CiteCard({ n, it }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: 14, border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
      background: 'var(--surface)', boxShadow: 'var(--shadow-sm)' }}>
      <span className="mono" style={{ width: 22, height: 22, flex: 'none', borderRadius: 6, background: 'var(--ink)',
        color: 'var(--paper)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>{n}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 6 }}>{it.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <SrcBadge kind={it.src} read={it.read} /><Cat id={it.cat} showLabel={false} />
          <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }} className="mono">{S.ED[it.ed]}</span>
          <Star on={it.starred} size={15} />
        </div>
      </div>
    </div>
  );
}
function SearchB() {
  const cites = ['bedrock', 'search-as-code', 'headroom'].map(sBy);
  return (
    <div className="rc" style={{ height: '100%', background: 'var(--paper)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', padding: '34px 40px 0' }}>
        <div style={{ width: '100%', maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <span style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--accent)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>M</span>
            <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
              which saved articles link GitHub repos with a skills/ directory, for marketing?</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ color: 'var(--accent)', paddingTop: 2 }}><Ico name="spark" s={20} /></span>
            <div style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--ink)' }}>
              Two of your saved items expose a <b>skills/</b> directory you could adapt for marketing
              workflows. <b>Headroom</b><sup style={{ color: 'var(--accent)' }}>1</sup> ships agent-skill
              templates and the <b>OpenAI cookbook</b><sup style={{ color: 'var(--accent)' }}>2</sup> includes
              an <span className="mono" style={{ fontSize: 13 }}>examples/skills/</span> folder with outreach
              and content drafts. Perplexity’s SaC SDK<sup style={{ color: 'var(--accent)' }}>3</sup> is
              adjacent — it has examples, but no marketing-specific skills yet.
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '22px 0 0', paddingLeft: 32 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '.04em' }}>3 SOURCES</span>
            {cites.map((it, i) => <CiteCard key={it.id} n={i + 1} it={it} />)}
          </div>
          <div style={{ display: 'flex', gap: 8, margin: '20px 0 0', paddingLeft: 32, flexWrap: 'wrap' }}>
            {['Only ones I starred', 'Compare their skill formats', 'Save as a collection'].map((f) => (
              <span key={f} className="rc-chip" style={{ fontSize: 13, padding: '7px 13px' }}>{f}</span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: '16px 40px 26px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: 720, display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 999, padding: '13px 18px',
          boxShadow: 'var(--shadow-md)' }}>
          <Ico name="spark" s={18} />
          <span style={{ fontSize: 14.5, color: 'var(--ink-3)' }}>Ask a follow-up…</span>
          <button className="rc-btn primary" style={{ marginLeft: 'auto', padding: '8px', borderRadius: 999, width: 34, height: 34 }}>
            <Ico name="arrow" s={17} /></button>
        </div>
      </div>
    </div>
  );
}

/* ════════════ C · Query builder (token-highlighted NL → structured) ════════════ */
function Tok({ children, type }) {
  const map = {
    topic:  ['var(--accent)', 'var(--accent-soft)', 'var(--accent-line)'],
    exclude:['var(--c-ai)', 'oklch(0.96 0.03 38)', 'oklch(0.85 0.07 38)'],
    type:   ['var(--c-tools)', 'oklch(0.96 0.03 128)', 'oklch(0.85 0.06 128)'],
  }[type] || ['var(--ink-2)', 'transparent', 'transparent'];
  return <span style={{ color: map[0], background: map[1], borderBottom: '2px solid ' + map[2],
    borderRadius: 4, padding: '1px 4px', fontWeight: 600 }}>{children}</span>;
}
function SearchC() {
  const res = [[sBy('headroom'), 96], [sBy('bedrock'), 88], [sBy('search-as-code'), 52]];
  return (
    <div className="rc" style={{ height: '100%', background: 'var(--surface)', display: 'flex' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '30px 48px 0' }}>
          <div style={{ border: '1.5px solid var(--ink)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--shadow-md)' }}>
            <div style={{ fontSize: 18, lineHeight: 1.6, letterSpacing: '-0.01em' }}>
              articles that linked <Tok type="type">github repos</Tok> with{' '}
              <Tok type="topic">skills directories</Tok> related to <Tok type="topic">marketing</Tok>,{' '}
              <Tok type="exclude">not agent</Tok>-powered
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, marginTop: 16,
            border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--surface-2)' }}>
            <div style={{ padding: '10px 14px', background: 'var(--ink)', color: 'var(--paper)', display: 'flex', alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.05em' }}>QUERY</span></div>
            <div className="mono" style={{ padding: '10px 14px', fontSize: 12.5, color: 'var(--ink-2)', display: 'flex',
              alignItems: 'center', gap: 8, flexWrap: 'wrap', lineHeight: 1.7 }}>
              <span style={{ color: 'var(--c-tools)' }}>resource=repo</span>
              <span style={{ color: 'var(--ink-4)' }}>AND</span>
              <span style={{ color: 'var(--accent)' }}>has:"skills/"</span>
              <span style={{ color: 'var(--ink-4)' }}>AND</span>
              <span style={{ color: 'var(--accent)' }}>~marketing</span>
              <span style={{ color: 'var(--ink-4)' }}>AND</span>
              <span style={{ color: 'var(--c-ai)' }}>NOT ~agent</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 0', paddingBottom: 12,
            borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>3 matches</span>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>embedding similarity × structured filters</span>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', padding: '4px 48px 0' }}>
          {res.map(([it, sc]) => <ResultRow key={it.id} it={it} score={sc} reason={it.resources ? 'has skills/ dir' : null} />)}
        </div>
      </div>
      <div style={{ width: 230, flex: 'none', borderLeft: '1px solid var(--line)', background: 'var(--paper)', padding: '30px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, letterSpacing: '-0.01em' }}>Refine</div>
        {[['Resource type', ['repo \u2713', 'paper', 'site']], ['Exclude topics', ['agent \u2713', 'crypto']], ['Edition', ['all']]].map(([h, opts]) => (
          <div key={h} style={{ marginBottom: 20 }}>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '.05em', marginBottom: 9, textTransform: 'uppercase' }}>{h}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {opts.map((o) => <span key={o} className={'rc-chip' + (o.includes('\u2713') ? ' on accent' : '')} style={{ fontSize: 12, padding: '5px 11px' }}>{o.replace(' \u2713', '')}</span>)}
            </div>
          </div>
        ))}
        <button className="rc-btn ghost" style={{ width: '100%', fontSize: 13, padding: '9px', marginTop: 8 }}>
          <Ico name="star" s={15} /> Save this search</button>
      </div>
    </div>
  );
}

Object.assign(window, { SearchA, SearchB, SearchC });
