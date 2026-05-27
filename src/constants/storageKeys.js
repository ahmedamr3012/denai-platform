const STORAGE_KEY   = 'denaiCaseState_v8';
const HISTORY_KEY   = 'denaiCaseHistory_v1';
const PATIENTS_KEY  = 'denaiPatients_v2';
const ACTIVE_PT_KEY = 'denaiActivePatient_v1';

// One-time migration: copy any data stored under old Dandy-branded keys to the
// new Denai keys. Called once at startup (init) before any reads. Non-destructive
// — old keys are left in place; new keys are only written if they don't exist yet.
function _migrateStorageKeys() {
  try {
    var OLD_HISTORY = 'dandyCaseHistory_v1';
    var OLD_ACTIVE  = 'dandyActivePatient_v1';

    // Migrate active patient pointer
    var oldActive = localStorage.getItem(OLD_ACTIVE);
    if (oldActive !== null && localStorage.getItem(ACTIVE_PT_KEY) === null) {
      try { localStorage.setItem(ACTIVE_PT_KEY, oldActive); } catch {}
    }

    // Migrate bare history key + all per-patient keys (dandyCaseHistory_v1_<id>)
    var toMigrate = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.startsWith(OLD_HISTORY)) toMigrate.push(k);
    }
    toMigrate.forEach(function(oldKey) {
      var newKey = HISTORY_KEY + oldKey.slice(OLD_HISTORY.length);
      if (localStorage.getItem(newKey) === null) {
        try {
          var val = localStorage.getItem(oldKey);
          if (val !== null) localStorage.setItem(newKey, val);
        } catch {}
      }
    });
  } catch {}
}
