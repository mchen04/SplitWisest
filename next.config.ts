import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating dev-tools indicator so it never overlaps the app chrome
  // (it was being mistaken for the user avatar in design review captures).
  devIndicators: false,
};

export default nextConfig;
