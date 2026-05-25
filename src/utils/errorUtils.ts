/**
 * Parses raw error messages (from Supabase, socket, or app logic) into
 * short, human-readable strings safe to show directly in the UI.
 */
export function parseError(raw: unknown): string {
  const msg =
    typeof raw === 'string'
      ? raw
      : (raw as any)?.message ?? String(raw ?? '');

  const m = msg.toLowerCase();

  // ── Auth / session ────────────────────────────────────────────────────────
  if (m.includes('not authenticated') || m.includes('no active session') || m.includes('unauthenticated'))
    return 'Your session expired — please restart the app.';
  if (m.includes('failed to initialize session') || m.includes('anonymous sign-in'))
    return 'Could not sign you in — check your connection.';
  if (m.includes('jwt') || m.includes('token'))
    return 'Session invalid — please restart the app.';

  // ── Network / connection ──────────────────────────────────────────────────
  if (m.includes('network') || m.includes('fetch') || m.includes('networkrequest'))
    return 'Network error — check your internet connection.';
  if (m.includes('timed out') || m.includes('timeout'))
    return 'Connection timed out — try again.';
  if (m.includes('could not connect') || m.includes('connection refused'))
    return 'Could not reach the server — try again.';

  // ── Username / profile ────────────────────────────────────────────────────
  if (m.includes('already taken') || m.includes('duplicate key') || m.includes('unique constraint') || m.includes('already exists'))
    return 'That username is already taken — try another.';
  if (m.includes('not found') && (m.includes('user') || m.includes('username')))
    return "We couldn't find that username.";
  if (m.includes('at least 2') || m.includes('too short'))
    return 'Username must be at least 2 characters.';
  if (m.includes('max 20') || m.includes('too long'))
    return 'Username cannot exceed 20 characters.';
  if (m.includes('letters, numbers') || m.includes('invalid characters'))
    return 'Only letters, numbers, and underscores allowed.';

  // ── Friend requests ───────────────────────────────────────────────────────
  if (m.includes('yourself'))
    return "You can't send a request to yourself.";
  if (m.includes('already friends') || m.includes('already sent') || m.includes('pending'))
    return 'A request already exists with that user.';
  if (m.includes('failed to send request'))
    return 'Could not send the request — try again.';

  // ── Permissions ───────────────────────────────────────────────────────────
  if (m.includes('row-level security') || m.includes('permission denied') || m.includes('violates rls'))
    return 'Permission denied — you may need to re-login.';
  if (m.includes('not authorized') || m.includes('unauthorized'))
    return "You're not authorised to do that.";

  // ── Generic fallback ──────────────────────────────────────────────────────
  return 'Something went wrong — please try again.';
}
