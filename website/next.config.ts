import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许 API 路由代理大文件（如安装包）时进行流式传输，避免超时
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
