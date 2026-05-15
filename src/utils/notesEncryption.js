// src/utils/notesEncryption.js
// Wave 7G: Client-side AES-GCM notes encryption for PHI protection.
//
// KEY STRATEGY: passphrase → PBKDF2 → AES-GCM 256-bit key (in-memory only).
//   - Salt (non-sensitive PBKDF2 parameter) stored in profiles.preferences.notesKeySalt
//   - Passphrase NEVER stored — lives only in memory per session
//   - Key cleared on sign-out: denaiNotesEnc.clearKey()
//   - Multi-device: same passphrase + same salt → identical key on any device
//
// THREAT MODEL:
//   - Supabase DB compromise: sees ciphertext only (AES-GCM + authenticated)
//   - Cloud operator visibility: ciphertext only
//   - Browser sync interception: ciphertext only
//   - Local access: notes remain plaintext in localStorage (local-first invariant)
//
// PAYLOAD FORMAT: JSON string { v:1, iv:<base64>, ct:<base64> }
//   v  — version (allows future format migration)
//   iv — 12 random bytes, unique per encryption (GCM standard)
//   ct — AES-GCM ciphertext (includes 16-byte GCM auth tag)
//
// FAILURE CONTRACT: all errors return null — never throw, never crash caller.

window.denaiNotesEnc = (function () {

  var _key = null; // CryptoKey — in-memory only, never persisted

  // ── Byte / Base64 helpers ─────────────────────────────────────────────────

  function _bytesToB64(arr) {
    return btoa(String.fromCharCode.apply(null, Array.from(arr)));
  }

  function _b64toBytes(b64) {
    var binary = atob(b64);
    var arr    = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  }

  // ── Public: generateSalt ──────────────────────────────────────────────────
  // Generates a random 16-byte PBKDF2 salt as a base64 string.
  // Call once per user at first setup; store result in profiles.preferences.notesKeySalt.
  // Non-sensitive: the salt does not reveal the passphrase.

  function generateSalt() {
    return _bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
  }

  // ── Public: init ──────────────────────────────────────────────────────────
  // Derives the AES-GCM key from passphrase + salt via PBKDF2 (100k iterations, SHA-256).
  // Returns true on success. A wrong passphrase succeeds here — it produces a key that
  // will fail silently at decrypt time (GCM auth tag mismatch → decrypt returns null).

  async function init(passphrase, saltB64) {
    try {
      var salt = _b64toBytes(saltB64);
      var raw  = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );
      _key = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
        raw,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      return true;
    } catch (e) {
      console.warn('[denaiNotesEnc] key init failed:', e.message);
      _key = null;
      return false;
    }
  }

  // ── Public: encrypt ────────────────────────────────────────────────────────
  // Encrypts plaintext with a unique 12-byte random IV.
  // Returns JSON string payload or null if no key / empty input / error.

  async function encrypt(plaintext) {
    if (!_key || !plaintext) return null;
    try {
      var iv      = crypto.getRandomValues(new Uint8Array(12));
      var encoded = new TextEncoder().encode(plaintext);
      var cipher  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, _key, encoded);
      return JSON.stringify({
        v:  1,
        iv: _bytesToB64(iv),
        ct: _bytesToB64(new Uint8Array(cipher)),
      });
    } catch (e) {
      console.warn('[denaiNotesEnc] encrypt failed:', e.message);
      return null;
    }
  }

  // ── Public: decrypt ────────────────────────────────────────────────────────
  // Returns plaintext string, or null on any failure:
  //   - no key (user skipped passphrase)
  //   - corrupt ciphertext (storage corruption)
  //   - wrong passphrase (GCM auth tag mismatch)
  //   - missing / invalid payload version
  // Null is always graceful — callers show "Unable to decrypt notes" or fall back.

  async function decrypt(payloadStr) {
    if (!_key || !payloadStr) return null;
    try {
      var p = JSON.parse(payloadStr);
      if (!p || p.v !== 1 || !p.iv || !p.ct) return null;
      var plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: _b64toBytes(p.iv) },
        _key,
        _b64toBytes(p.ct)
      );
      return new TextDecoder().decode(plain);
    } catch (e) {
      // Auth tag mismatch (wrong key or corrupt) — silent graceful failure
      console.warn('[denaiNotesEnc] decrypt failed:', e.message);
      return null;
    }
  }

  // ── Public: hasKey / clearKey ─────────────────────────────────────────────

  function hasKey()   { return _key !== null; }
  function clearKey() { _key = null; }

  return Object.freeze({
    generateSalt: generateSalt,
    init:         init,
    encrypt:      encrypt,
    decrypt:      decrypt,
    hasKey:       hasKey,
    clearKey:     clearKey,
  });

})();
