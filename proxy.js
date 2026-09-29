import { NextResponse } from "next/server";
import { analyticsAuthorized } from "./app/analytics-auth.js";

export function proxy(request) {
  const username = process.env.ANALYTICS_USERNAME || "beaty";
  const password = process.env.ANALYTICS_PASSWORD || "beaty";
  if (analyticsAuthorized(request.headers.get("authorization"), username, password)) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Beaty map analytics", charset="UTF-8"' },
  });
}

export const config = {
  matcher: "/analytics/:path*",
};
