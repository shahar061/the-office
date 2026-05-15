// Strip personally-identifying or path-leaking content from strings before
// they leave the machine. Applied to error messages, stack traces, and
// breadcrumb payloads — NOT to event payloads, which are typed and
// hand-curated to be safe.
//
// We err on the side of over-redaction: a stray home-directory path or email
// in a stack trace is worse than losing some debugging precision.

const HOME_RE = /\/Users\/[^/\s"'`)]+|\/home\/[^/\s"'`)]+|C:\\Users\\[^\\s"'`)]+/g;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// http(s) URLs — keep the scheme + host but drop path + query (which often
// contains tokens, ids, or filenames).
const URL_RE = /\b(https?:\/\/[^/\s]+)\/[^\s"'`)<>]*/g;
// IPv4 (very loose; collapses any 4-octet sequence)
const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
// JWT-ish bearer tokens or long opaque strings preceded by 'token=' / 'key=' / 'secret='
const TOKEN_RE = /\b(token|key|secret|authorization|bearer)\s*[:=]\s*["']?[A-Za-z0-9._\-+/=]{16,}["']?/gi;

export function scrubString(input: string): string {
  if (!input) return input;
  return input
    .replace(HOME_RE, '~')
    .replace(URL_RE, '$1/[redacted]')
    .replace(EMAIL_RE, '[redacted-email]')
    .replace(IPV4_RE, '[redacted-ip]')
    .replace(TOKEN_RE, '$1=[redacted]');
}

/** Recursively scrub all string values in an arbitrary JSON-shaped value. */
export function scrubValue<T>(value: T): T {
  if (typeof value === 'string') return scrubString(value) as unknown as T;
  if (Array.isArray(value)) return value.map(scrubValue) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(v);
    }
    return out as unknown as T;
  }
  return value;
}
