const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string,
): Promise<boolean> {
  try {
    const body = new FormData();
    body.append('secret', secret);
    body.append('response', token);
    body.append('remoteip', remoteIp);

    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;

    const json = await res.json() as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
