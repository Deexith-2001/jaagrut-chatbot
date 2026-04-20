/** @type {import('next').NextConfig} */
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4001";

const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const socketWs = SOCKET_URL.replace(/^http/, "ws");
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              `connect-src 'self' ${SOCKET_URL} ${socketWs} https://*.ably.io wss://*.ably.io https://rest.ably.io wss://realtime.ably.io`,
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
