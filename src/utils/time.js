function _wfTimestamp(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7)  return d + 'd ago';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function _relativeTime(isoString) {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const min  = Math.floor(diff / 60000);
    if (min < 1)  return 'just now';
    if (min < 60) return min + ' min ago';
    const hr = Math.floor(min / 60);
    if (hr  < 24) return hr + ' hr ago';
    const day = Math.floor(hr / 24);
    return day + ' day' + (day === 1 ? '' : 's') + ' ago';
  } catch { return ''; }
}

function _newerTs(a, b) {
  if (!a) return b;
  if (!b) return a;
  try { return new Date(a).getTime() >= new Date(b).getTime() ? a : b; } catch { return a; }
}
