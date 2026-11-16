import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 后台表单字段较多时留出余量；批量导入已改为浏览器解析 + 分块 POST，
    // 不再受 Server Action 请求体上限影响。
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
