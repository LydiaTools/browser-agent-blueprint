# 标签页分开了，登录状态就分开了吗？

两个 Agent 可以各用一个标签页，却仍看到同一个账号。标签页决定在哪里操作；Cookie 和 `localStorage` 属于浏览器的存储上下文。

我们跟进了 [agent-browser 的公开讨论 #1530](https://github.com/vercel-labs/agent-browser/issues/1530)：用户报告多个会话连接同一个 Chrome 时会争抢标签。该问题现已关闭，[相关修复](https://github.com/vercel-labs/agent-browser/pull/1589)提供了固定标签功能；项目的[会话文档](https://github.com/vercel-labs/agent-browser/blob/main/skill-data/core/references/session-management.md)也说明，连接同一 Chrome 的会话仍共享 Cookie。

## 在本地验证这个区别

这个可选实验使用 **agent-browser 0.41.0**、Node 24+、Playwright 和全新的无头 Chromium 配置，在本地启动虚构数据测试页面，不连接现有浏览器、账号或真实网站。我们在 macOS 与 Chrome 上验证过这条集成路径，其他环境可能需要安装兼容的 Chromium。

在当前源码目录执行：

```bash
npm install --ignore-scripts
npx playwright install chromium
tool_dir="$(mktemp -d)"
npm install --prefix "$tool_dir" --ignore-scripts agent-browser@0.41.0
node demo/agent-browser-pinned.cjs "$(command -v node)" "$tool_dir/node_modules/agent-browser/bin/agent-browser.js"
```

两处 `node` 都需使用 Node 24+。固定的 v0.2.4 ZIP 不含本次可选实验，请使用 v0.2.5 或当前仓库源码。`tool_dir` 是独立的临时安装目录，实验结束后可自行删除。

脚本检查三件事：

1. 连接同一个临时浏览器的两个固定会话，分别留在虚构的 `/a`、`/b` 标签页。
2. 同源标签 A 写入的 Cookie 和 localStorage 值能被标签 B 看到。
3. 关闭标签 A 后，测试中的下一次固定标签 `get url` 返回 `tab_gone`。

如需对照独立 Playwright 上下文，可运行 `npm run demo:session-isolation`，见[配套说明](session-isolation.zh-CN.md)。这只是本地小实验，并非安全审计，也不代表所有 agent-browser 命令、网站、浏览器适配器或版本都有相同行为。固定标签不能单独作为账号隔离边界；使用真实账号前，应选择适合该浏览器的隔离方式，并先用虚构数据核验。
