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

## 双部署

- [Vercel 完整站](https://repo-beta-self.vercel.app)：继续运行现有 Next.js 应用，包含实时数据、登录、发布和后台管理。
- [GitHub Pages 只读版](https://schneiderlin.github.io/infinite-connection/)：首页及招聘、资助、工具的公开抓取快照，支持搜索筛选；项目动态、登录和发布链接前往 Vercel。快照随 `main` 上的数据文件更新重新发布，不连接数据库、不需要凭据。

首次发布需在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。之后推送 `main` 或在 Actions 手动运行 **Deploy read-only site to GitHub Pages** 即可发布。独立构建使用 `pnpm build:pages`，产物在 `github-pages/out/`，部署路径为 `/infinite-connection/`。

## 目录

- `src/app/`：网站页面与样式
- `public/`：公开静态资源
- `docs/`：业务知识库、产品讨论稿与原始参考资料
