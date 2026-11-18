// Helpers for Postgres connection strings. Pure: no I/O.
// String-based on purpose: only the password component changes, everything else stays byte-identical.

interface Userinfo {
  /** Index of the first character of the userinfo (right after "://"). */
  start: number;
  /** Index of the "@" that ends the userinfo. */
  end: number;
}

function locateUserinfo(url: string): Userinfo | null {
  const m = /^postgres(?:ql)?:\/\//i.exec(url);
  if (m === null) return null;
  const start = m[0].length;
  const rest = url.slice(start);
  const authorityLength = rest.search(/[/?#]/);
  const authority = authorityLength === -1 ? rest : rest.slice(0, authorityLength);
  const at = authority.lastIndexOf("@");
  if (at === -1) return null;
  return { start, end: start + at };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Percent-encodes a password for use in a connection string, including `!'()*`. */
export function encodePassword(password: string): string {
  return encodeURIComponent(password).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** The decoded username, or null when the string has no userinfo. */
export function getConnectionUser(url: string): string | null {
  const info = locateUserinfo(url);
  if (info === null) return null;
  const userinfo = url.slice(info.start, info.end);
  const colon = userinfo.indexOf(":");
  return safeDecode(colon === -1 ? userinfo : userinfo.slice(0, colon));
}

/** The decoded password, or null when absent. */
export function getConnectionPassword(url: string): string | null {
  const info = locateUserinfo(url);
  if (info === null) return null;
  const userinfo = url.slice(info.start, info.end);
  const colon = userinfo.indexOf(":");
  return colon === -1 ? null : safeDecode(userinfo.slice(colon + 1));
}

export function connectionUserMatches(url: string, role: string): boolean {
  return getConnectionUser(url) === role;
}

/**
 * Replaces only the password of a Postgres connection string. The new password is
 * percent-encoded. Throws when the string has no userinfo (the message never contains the URL).
 */
export function replaceConnectionPassword(url: string, newPassword: string): string {
  const info = locateUserinfo(url);
  if (info === null) throw new Error("Connection string has no user to attach a password to");
  const userinfo = url.slice(info.start, info.end);
  const colon = userinfo.indexOf(":");
  const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
  return `${url.slice(0, info.start)}${user}:${encodePassword(newPassword)}${url.slice(info.end)}`;
}
