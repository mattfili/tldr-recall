/* Recall — EDITORIAL issue reader + DARK wrapper.
   Exports: Dark, IssueReader, ArticleFocus. */
const E = window.RECALL;
const eBy = (id) => E.ITEMS.find((x) => x.id === id);

// wraps any existing variant in the dark theme (vars inherit inward)
function Dark({ children }) {
  return <div className="rc dark" style={{ height: '100%' }}>{children}</div>;
}

// inline action row used on each editorial item
function EdActions({ saved }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {saved ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600,
          color: 'var(--star)', background: 'var(--star-soft)', borderRadius: 999, padding: '5px 11px' }}>
          <Ico name="check" s={14} /> Saved</span>
      ) : (
        <button className="rc-btn ghost" style={{ fontSize: 12.5, padding: '6px 12px' }}>
          <Ico name="star" s={15} /> Save</button>
      )}
      <button className="rc-btn ghost" title="Share" style={{ padding: '6px 9px' }}><Ico name="share" s={15} /></button>
      <button className="rc-btn ghost" title="Open original" style={{ padding: '6px 9px' }}><Ico name="link" s={15} /></button>
    </div>
  );
}

function EdItem({ it, saved }) {
  return (
    <article style={{ padding: '20px 0', borderBottom: '1px solid var(--line-2)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25,
          color: 'var(--ink)', textWrap: 'balance', cursor: 'pointer' }}>
          {it.title}</span>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
          ({it.read ? it.read + ' min read' : E.ITEMS && (it.src === 'repo' ? 'GitHub repo' : it.src)})</span>
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.62, color: 'var(--ink-2)', margin: '0 0 12px', maxWidth: 600, textWrap: 'pretty' }}>{it.sum}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <FaviconChip domain={it.domain} size={18} />
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{it.domain}</span>
          {it.resources && it.resources.slice(0, 1).map((r, i) => <ResourcePill key={i} r={r} />)}
        </div>
        <EdActions saved={saved} />
      </div>
    </article>
  );
}

function EdSection({ catId, label, children }) {
  const c = E.CATS[catId];
  return (
    <section style={{ marginTop: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6, marginBottom: 4,
        borderBottom: '2px solid var(--ink)' }}>
        <span className="rc-dot" style={{ background: c.v, width: 10, height: 10 }} />
        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
          margin: 0, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>{label || c.label}</h2>
      </div>
      {children}
    </section>
  );
}

function IssueReader() {
  return (
    <div className="rc" style={{ height: '100%', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
      {/* app bar — Recall is the host product */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 36px',
        borderBottom: '1px solid var(--line)', background: 'var(--paper)', position: 'sticky', top: 0, zIndex: 3 }}>
        <Logo size={16} />
        <div style={{ width: 1, height: 20, background: 'var(--line)' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {['Library', 'Read', 'Search'].map((n, i) => (
            <span key={n} style={{ fontSize: 13.5, fontWeight: 500, padding: '6px 11px', borderRadius: 7,
              background: i === 1 ? 'var(--ink)' : 'transparent', color: i === 1 ? 'var(--paper)' : 'var(--ink-2)' }}>{n}</span>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <span className="rc-chip" style={{ fontSize: 12.5, padding: '6px 12px' }}><Ico name="clock" s={14} /> 12 min issue</span>
        <button className="rc-btn ghost" style={{ padding: '7px 9px' }}><Ico name="star" s={16} /></button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', justifyContent: 'center', gap: 44, padding: '0 40px' }}>
        {/* reading column */}
        <div style={{ width: 620, flex: 'none', padding: '36px 0 50px' }}>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)', letterSpacing: '.06em', marginBottom: 12 }}>
            TUESDAY, JUNE 2 2026 · ISSUE #1487</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.04em', margin: 0 }}>TLDR AI</h1>
            <span className="rc-chip on accent" style={{ fontSize: 12, padding: '5px 12px' }}>subscribed</span>
          </div>
          <p style={{ fontSize: 17, lineHeight: 1.5, color: 'var(--ink-2)', margin: '0 0 4px', fontWeight: 500, textWrap: 'pretty' }}>
            Anthropic IPO filing, OpenAI lands on AWS, and Perplexity reframes search as code.</p>

          {/* sponsor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '24px 0 6px', padding: '14px 16px',
            background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)' }}>
            <span style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--ink)', color: 'var(--paper)', flex: 'none',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17 }}>D</span>
            <div style={{ minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', letterSpacing: '.05em', marginBottom: 2 }}>TOGETHER WITH DATADOG</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Dataiku drives the shift to always-on AI governance</div>
            </div>
            <button className="rc-btn ghost" style={{ marginLeft: 'auto', fontSize: 12.5, padding: '7px 13px', whiteSpace: 'nowrap' }}>Read</button>
          </div>

          <EdSection catId="headlines" label="Headlines & Launches">
            <EdItem it={eBy('anthropic-ipo')} saved />
            <EdItem it={eBy('openai-aws')} />
            <EdItem it={eBy('nemotron')} />
            <EdItem it={eBy('qwen')} saved />
          </EdSection>

          <EdSection catId="deep" label="Deep Dives & Analysis">
            <EdItem it={eBy('video-agents')} />
            <EdItem it={eBy('model-welfare')} />
          </EdSection>

          <EdSection catId="eng" label="Engineering & Research">
            <EdItem it={eBy('bedrock')} />
            <EdItem it={eBy('cosmos3')} />
          </EdSection>
        </div>

        {/* right rail */}
        <div style={{ width: 250, flex: 'none', padding: '40px 0' }}>
          <div style={{ position: 'sticky', top: 24 }}>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '.06em', marginBottom: 12 }}>IN THIS ISSUE</div>
            {[['Headlines & Launches', 'headlines', 4], ['Deep Dives & Analysis', 'deep', 2], ['Engineering & Research', 'eng', 2]].map(([l, c, n]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', fontSize: 13, color: 'var(--ink-2)' }}>
                <span className="rc-dot" style={{ background: E.CATS[c].v }} />
                <span style={{ flex: 1 }}>{l}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{n}</span>
              </div>
            ))}

            <div style={{ marginTop: 24, padding: 16, borderRadius: 'var(--r-md)', background: 'var(--accent-soft)',
              border: '1px solid var(--accent-line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ color: 'var(--accent)' }}><Ico name="library" s={16} /></span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Saved to your library</span>
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', marginBottom: 12 }}>
                2 items from this issue. Star anything to recall it later by meaning.</div>
              {['anthropic-ipo', 'qwen'].map((id) => (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12.5 }}>
                  <Star on size={14} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink-2)' }}>{eBy(id).title}</span>
                </div>
              ))}
              <button className="rc-btn primary" style={{ width: '100%', fontSize: 12.5, padding: '8px', marginTop: 10 }}>
                <Ico name="spark" s={14} /> Search your library</button>
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button className="rc-btn ghost" style={{ flex: 1, fontSize: 12.5, padding: '8px' }}>← Jun 1</button>
              <button className="rc-btn ghost" style={{ flex: 1, fontSize: 12.5, padding: '8px' }}>Next →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* single-article focus reading view */
function ArticleFocus() {
  const it = eBy('search-as-code');
  return (
    <div className="rc" style={{ height: '100%', background: 'var(--paper)', display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ width: 600, background: 'var(--surface)', height: '100%', borderLeft: '1px solid var(--line)',
        borderRight: '1px solid var(--line)', padding: '34px 44px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button className="rc-btn ghost" style={{ padding: '6px 10px', fontSize: 12.5 }}>← Issue</button>
          <div style={{ flex: 1 }} />
          <Star on={it.starred} size={20} />
          <button className="rc-btn ghost" style={{ padding: '6px 9px' }}><Ico name="share" s={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <SrcBadge kind={it.src} read={it.read} /><Cat id={it.cat} />
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 18px', textWrap: 'balance' }}>{it.title}</h1>
        <p style={{ fontSize: 17, lineHeight: 1.62, color: 'var(--ink)', margin: '0 0 16px', textWrap: 'pretty' }}>{it.sum}</p>
        <p style={{ fontSize: 16, lineHeight: 1.66, color: 'var(--ink-2)', margin: '0 0 20px', textWrap: 'pretty' }}>
          The newsletter gives you the gist in 30 seconds. When you need the full picture, open the original inline —
          Recall keeps your place, your highlights, and the extracted resources below.</p>
        <div style={{ padding: '14px 16px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-md)', marginBottom: 'auto' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', letterSpacing: '.05em', marginBottom: 10 }}>LINKED RESOURCES</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {it.resources.map((r, i) => <ResourcePill key={i} r={r} />)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, paddingTop: 18 }}>
          <button className="rc-btn primary" style={{ flex: 1, fontSize: 14, padding: '11px' }}>Open original <Ico name="arrow" s={16} /></button>
          <button className="rc-btn ghost" style={{ fontSize: 14, padding: '11px 14px' }}><Ico name="tag" s={16} /> Tag</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dark, IssueReader, ArticleFocus });
