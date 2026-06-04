import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg-native"], // pg itself is pure JS; only the native binding needs this
};

export default nextConfig;
