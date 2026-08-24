import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS === 'true';

const nextConfig: NextConfig = {
  // 开启静态导出模式
  output: "export",
  
  // 自动适配 GitHub Pages 默认域名后缀 (例如 VipBeCool.github.io/SkillHub)
  // 如果你在 GitHub 绑定了独立域名，请把这一行直接删掉
  basePath: isGithubActions ? "/SkillHub" : "",
  
  // 静态导出不支持 Next.js 默认的图片优化服务
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
