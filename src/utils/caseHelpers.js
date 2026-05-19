function _getPatientStageBadge(p) {
  if (p.caseDelivered) return { icon: 'fa-circle-check', label: 'Delivered', cls: 'stage-delivered' };
  if (!p.condition) return { icon: 'fa-scanner-keyboard', label: 'New', cls: 'stage-new' };
  if (p.planApproved) {
    if (p.labStatus === 'received') return { icon: 'fa-circle-check', label: 'Lab Received', cls: 'stage-lab' };
    if (p.labStatus) return { icon: 'fa-flask', label: 'Lab Sent', cls: 'stage-lab' };
    return { icon: 'fa-pen-ruler', label: 'Plan Approved', cls: 'stage-plan' };
  }
  return { icon: 'fa-brain', label: 'In Analysis', cls: '' };
}

function _getCaseUrgency(p) {
  if (p.caseDelivered)                return '';
  if (p.labStatus === 'received')     return 'urg-received';
  if (p.planApproved && !p.labStatus) return 'urg-waiting';
  if (!p.condition)                   return 'urg-new';
  return '';
}

function _getStalenessText(p) {
  if (p.caseDelivered || !p.condition || !p.lastAccessed) return '';
  const days = Math.floor((Date.now() - p.lastAccessed) / 86400000);
  if (days < 7) return '';
  if (!p.planApproved)              return days + ' days in analysis';
  if (!p.labStatus)                 return days + ' days awaiting lab';
  if (p.labStatus === 'received')   return days + ' days awaiting delivery';
  return days + ' days at lab';
}

function _wfEventLabel(type) {
  return ({
    analysis_completed:  'AI Analysis Completed',
    plan_approved:       'Treatment Plan Approved',
    plan_reopened:       'Planning Reopened',
    lab_sent:            'Sent to Laboratory',
    lab_received:        'Lab Restoration Received',
    report_generated:    'Report Generated',
    case_delivered:      'Case Delivered',
    delivery_reopened:   'Case Reopened After Delivery',
  })[type] || type;
}

function _quickScore(p) {
  if (!p.bone || !p.hygiene) return null;
  let s = 96.4;
  if (p.bone    === 'Good') s += 0.8; else if (p.bone    === 'Poor') s -= 12.5; else s -= 4.2;
  if (p.hygiene === 'Good') s += 0.5; else if (p.hygiene === 'Poor') s -= 11.5; else s -= 2.6;
  return Math.round(Math.max(50, Math.min(99, s)));
}
