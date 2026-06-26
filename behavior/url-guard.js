// Pure, side-effect-free URL allow check. Kept free of Electron so the security
// logic is unit-testable headlessly. The LLM's action output is UNTRUSTED (the
// behavior context includes attacker-controllable window titles), so this is the
// real enforcement point — not the prompt.

// Normalize a user-supplied domain: lowercase, strip a leading "www.", drop blanks.
function normalizeDomains(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((d) => String(d).trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean);
}

// Returns { ok: boolean, reason?: 'unparseable'|'scheme'|'host' }.
function isUrlAllowed(rawUrl, allowedDomains) {
  const allowed = normalizeDomains(allowedDomains);
  if (allowed.length === 0) return { ok: false, reason: 'host' };

  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return { ok: false, reason: 'unparseable' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'scheme' };
  }

  // Reject embedded credentials (user:pass@host) — a classic obfuscation vector.
  if (url.username || url.password) {
    return { ok: false, reason: 'host' };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!host) return { ok: false, reason: 'host' };

  // Exact host match, or a subdomain of an allowed domain (foo.github.com ⊂ github.com).
  const match = allowed.some(
    (d) => host === d || host.endsWith('.' + d)
  );
  return match ? { ok: true } : { ok: false, reason: 'host' };
}

module.exports = { isUrlAllowed, normalizeDomains };
