import type { NextConfig } from 'next';

const cspDirectives = [
  "default-src 'self'",
  // 'unsafe-inline' on style-src is required by MapLibre and many React setups; revisit with nonces post-MVP.
  "style-src 'self' 'unsafe-inline'",
  // 'unsafe-inline' is required for Next.js's hydration scripts (route/data
  // injection happens via inline <script> tags). The proper-grade alternative
  // is per-request nonces via middleware — significant complexity for the
  // marginal additional defense at this stage. Other directives still hold:
  // object-src 'none', frame-ancestors 'none', img-src restricted to https,
  // connect-src restricted to OpenFreeMap, and the input-side defenses
  // (SafeUrlSchema / ImageUrlSchema) reject javascript:/svg payloads.
  // 'wasm-unsafe-eval' for MapLibre's projection WASM. 'unsafe-eval' for Next
  // dev/Turbopack runtime.
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' 'wasm-unsafe-eval'",
  "img-src 'self' https: data: blob:", // hotlinked developer floorplans, OpenFreeMap tiles
  "font-src 'self' data:", // next/font self-hosts; data: covers WOFF inlining edge cases
  "connect-src 'self' https://tiles.openfreemap.org https://*.openfreemap.org",
  "worker-src 'self' blob:", // MapLibre uses workers
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspDirectives },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
