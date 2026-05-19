function _synthesizeWfBaseline(p) {
  const evs = [];
  if (p.labStatus === 'received') {
    evs.push({ type: 'lab_received',  ts: null, synthetic: true });
    evs.push({ type: 'lab_sent',      ts: null, synthetic: true });
    evs.push({ type: 'plan_approved', ts: null, synthetic: true });
  } else if (p.labStatus) {
    evs.push({ type: 'lab_sent',      ts: null, synthetic: true });
    evs.push({ type: 'plan_approved', ts: null, synthetic: true });
  } else if (p.planApproved) {
    evs.push({ type: 'plan_approved', ts: null, synthetic: true });
  }
  return evs;
}

function _renderWfTimeline(events) {
  if (!events || events.length === 0) return '';
  const items = events.map((ev, i) => {
    const label   = _wfEventLabel(ev.type);
    const time    = ev.synthetic ? 'Previously' : _wfTimestamp(ev.ts);
    const dotCls  = ev.synthetic ? ' wf-tl-synthetic' : '';
    const hasLine = i < events.length - 1;
    return `<li class="wf-tl-item">` +
      `<div class="wf-tl-indicator" aria-hidden="true">` +
        `<div class="wf-tl-dot${dotCls}"></div>` +
        (hasLine ? `<div class="wf-tl-connector"></div>` : '') +
      `</div>` +
      `<div class="wf-tl-content">` +
        `<span class="wf-tl-label">${escapeHtml(label)}</span>` +
        `<span class="wf-tl-time">${escapeHtml(time)}</span>` +
      `</div>` +
    `</li>`;
  }).join('');
  return `<div class="wf-tl-section">` +
    `<h3 class="wf-tl-section-title">Case Progress</h3>` +
    `<ol class="wf-timeline" aria-label="Case progress timeline">${items}</ol>` +
  `</div>`;
}
