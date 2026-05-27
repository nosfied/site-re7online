import type { NextConfig } from "next";

function getLocalAgentApiUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL;

  if (configuredUrl?.startsWith("http://") || configuredUrl?.startsWith("https://")) {
    return configuredUrl;
  }

  return "http://127.0.0.1:3002";
}

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];

    return [
      {
        source: "/agent-api/:path*",
        destination: `${getLocalAgentApiUrl()}/:path*`,
      },
    ];
  },
};

export default nextConfig;
