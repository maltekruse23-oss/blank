import type { NextConfig } from "next";

/** Pages that had German addresses at the root before English became the default (07.10.2026):
 * old links keep working and land on the German page. */
const MOVED = ["rangliste", "rekorde", "tierliste", "mitmachen", "wertung", "datenschutz", "spiel"];

const nextConfig: NextConfig = {
  async redirects() {
    return MOVED.flatMap((page) => [
      { source: `/${page}`, destination: `/de/${page}`, permanent: true },
      { source: `/${page}/:rest*`, destination: `/de/${page}/:rest*`, permanent: true },
    ]);
  },
};

export default nextConfig;
