import type { NextConfig } from "next";
import { REDIRECTS } from "./redirects";

const nextConfig: NextConfig = {
  async redirects() {
    return REDIRECTS;
  },
};

export default nextConfig;
