import { saveUsageEvent } from "../../usage-store.js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    saveUsageEvent(body);
    return new Response(null, { status: 204 });
  } catch (error) {
    const invalid = error instanceof SyntaxError || error?.message === "Invalid usage event" || error?.message === "Event must be an object";
    if (!invalid) console.error("Unable to persist usage event", error);
    return Response.json({ error: invalid ? "Invalid usage event" : "Unable to persist usage event" }, { status: invalid ? 400 : 500 });
  }
}
