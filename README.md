# 无限连接

面向公益机构、公益从业者与志愿者的行业信息和资源连接平台。目前处于 MVP 内容与范围定义阶段。

产品背景、参考材料与讨论稿统一维护在 [`docs/`](./docs/README.md)。

## 技术栈

- Next.js 16（App Router）
- React 19
- TypeScript（strict mode）
- ESLint
- pnpm

## 本地开发

```bash
pnpm install
pnpm dev
```

浏览器打开 `http://localhost:3000`。

## 常用命令

```bash
pnpm dev      # 启动开发服务器
pnpm lint     # 代码检查
pnpm build    # 生产构建与类型检查
pnpm start    # 启动生产服务器
```

## 目录

- `src/app/`：网站页面与样式
- `public/`：公开静态资源
- `docs/`：业务知识库、产品讨论稿与原始参考资料
