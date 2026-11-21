import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pg", "exceljs", "docx", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
};

export default config;
