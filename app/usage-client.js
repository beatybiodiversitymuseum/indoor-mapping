const ENDPOINT = "/map/api/usage-events";

export function sendUsageEvent(sessionId, eventType, fields = {}, { beacon = false } = {}) {
  if (!sessionId) return;
  const body = JSON.stringify({
    session_id: sessionId,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    ...fields,
  });
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }));
    return;
  }
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}
