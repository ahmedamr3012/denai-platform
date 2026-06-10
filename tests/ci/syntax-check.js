// tests/ci/syntax-check.js
// Parses every inline <script> block in index.html with new Function().
// Catches unbalanced braces/backticks/parens introduced by inline-script edits.
//
// KNOWN LIMIT (cerebrum, R4.1/bug-109): new Function() does NOT catch the
// literal-</body></html>-inside-template-literal HTML parser quirk. That class
// of bug still requires a real browser (smoke test). This is a fast pre-check,
// not a replacement.
//
// Run: node tests/ci/syntax-check.js

'use strict';

var fs = require('fs');
var path = require('path');

var html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
var m, idx = 0, failures = 0, checked = 0;

while ((m = re.exec(html)) !== null) {
  idx++;
  var attrs = m[1] || '';
  var body = m[2] || '';
  if (/\bsrc\s*=/.test(attrs)) continue;        // external script — skip
  if (!body.trim()) continue;                    // empty block — skip
  if (/type\s*=\s*["'](?!text\/javascript)/i.test(attrs)) continue; // non-JS (e.g. json)
  checked++;
  try {
    new Function(body);
  } catch (e) {
    failures++;
    var lineOffset = html.slice(0, m.index).split('\n').length;
    console.error('FAIL: inline script #' + idx + ' (starts ~line ' + lineOffset + '): ' + e.message);
  }
}

if (failures === 0) {
  console.log('PASS — ' + checked + ' inline script block(s) parsed cleanly');
  process.exit(0);
} else {
  console.error('FAIL — ' + failures + ' inline script block(s) with syntax errors');
  process.exit(1);
}
