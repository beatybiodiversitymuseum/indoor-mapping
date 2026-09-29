import { timingSafeEqual } from "node:crypto";

function equal(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function analyticsAuthorized(header, username = "beaty", password = "beaty") {
  if (!header?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return equal(decoded.slice(0, separator), username) && equal(decoded.slice(separator + 1), password);
  } catch {
    return false;
  }
}
