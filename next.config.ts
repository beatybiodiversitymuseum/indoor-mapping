import type { NextConfig } from "next";

const basePath = process.env.APP_BASE_PATH || "/map";
if (!basePath.startsWith("/") || basePath.endsWith("/")) {
  throw new Error("APP_BASE_PATH must start with / and must not end with /");
}

const nextConfig: NextConfig = {
  output: "standalone",
  basePath,
};

export default nextConfig;
