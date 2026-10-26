import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 后台批量导入 Excel/JSON 通过 Server Action 上传，默认 1MB 不够用。
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
