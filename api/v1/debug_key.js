// GET /v1/_debug_key — read-only diagnostic. Returns ONLY a SHA-256
// fingerprint of the sanitized GIGI_API_KEY currently in env. Lets us
// compare against locally-computed hashes of the OLD vs NEW key to
// tell which one production is actually using — without ever shipping
// the key bytes off the function.
//
// Apply the SAME sanitizer used in /v1/gql so the fingerprint we
// report matches the one the proxy uses on the wire. If they differ,
// the bug is in the sanitizer; if they agree, the bug is in what was
// pasted into the Vercel env.
//
// Delete this file once we've confirmed the env value (next commit).

const crypto = require('crypto');

function sanitizeEnv(raw) {
  if (!raw) return '';
  let s = String(raw);
  while (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.trim();
}

module.exports = function handler(req, res) {
  const raw = process.env.GIGI_API_KEY || '';
  const sanitized = sanitizeEnv(raw);
  const fingerprint = (s) =>
    s ? crypto.createHash('sha256').update(s).digest('hex').slice(0, 16) : null;

  res.status(200).json({
    raw_length: raw.length,
    sanitized_length: sanitized.length,
    raw_fingerprint: fingerprint(raw),
    sanitized_fingerprint: fingerprint(sanitized),
    had_bom: raw.charCodeAt(0) === 0xfeff,
    had_trailing_crlf: /[\r\n]+$/.test(raw),
    had_trailing_ws: raw !== raw.trim(),
    raw_first_4_codepoints: Array.from(raw.slice(0, 4)).map((c) => c.charCodeAt(0)),
  });
};
