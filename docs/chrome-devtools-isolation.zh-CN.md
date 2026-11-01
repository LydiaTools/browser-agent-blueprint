# 两个 DevTools MCP 服务，两份浏览器配置

两个编程 Agent 同时需要浏览器。如果两个 MCP 服务启动 Chrome 时指向同一个用户数据目录，多开一个标签页就能得到独立会话吗？

这个本地示例实际调用 **chrome-devtools-mcp 1.12.0**。在 macOS 和 Chrome 156.0.8078.74 上，第二个服务尝试启动同一个临时配置时，收到浏览器已运行的错误；改用两份临时配置后，两个服务访问同一个合成本地网站，各自的数据保持分开。

| 检查 | 实际观察 |
| --- | --- |
| 服务 A 写入 `agent_a` | A 的 localStorage 和本地服务收到的 Cookie 都是 `agent_a` |
| 第二个服务使用 A 的配置 | 启动被拒绝：浏览器已运行 |
| 服务 B 使用另一份配置 | 初始 localStorage 和请求 Cookie 均无角色标记 |
| B 写入 `agent_b`，A 再次读取 | B 看到 `agent_b`，A 仍看到 `agent_a` |

## 运行

需要 Node 22.12+ 和已安装的 Chrome。安装固定版本的可选依赖需要网络；示例将浏览器指向自建本机回环服务，不连接现有浏览器或账号。示例关闭 MCP 使用统计和 CrUX 查询；未审计 Chrome 自身的后台网络。

```bash
DEVTOOLS_DEPS_DIR="$(mktemp -d)"
export DEVTOOLS_DEPS_DIR
npm install --prefix "$DEVTOOLS_DEPS_DIR" --ignore-scripts --no-audit --no-fund --save-exact \
  chrome-devtools-mcp@1.12.0 @modelcontextprotocol/sdk@1.32.2

# macOS 示例；请改为你的 Chrome 程序绝对路径
export DEVTOOLS_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run demo:devtools-isolation
```

如果配置占用、Cookie 或 localStorage 的实际结果不符合预期，命令会以非零状态退出。运行结束后，示例关闭客户端和本地服务，并删除本次临时配置。如需指定配置的临时目录，可设置已有的绝对路径 `DEVTOOLS_TEST_DIR`；单独安装的依赖目录需要自行保留或删除。

## 验证范围

这里验证的是三个独立 MCP 服务进程、两个明确指定的临时用户数据目录、一个本地域名，以及 Cookie 和 localStorage。它**没有**运行 Codex、Claude 或 AI 模型，没有使用真实账号，也没有测试共享 MCP 服务的 page ID 路由；不能推广到所有浏览器、网络或操作系统。这不是对上游并发会话需求的修复。

[上游并发会话指南](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/advanced-usage.md#concurrent-sessions)还介绍了使用 `--isolated` 创建独立临时配置。这个示例**没有**测试该参数：它明确传入不同的 `--userDataDir`，以便和同一目录的启动行为对照。

相关公开来源：[Chrome DevTools MCP Issue #3070](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/3070)（核查时仍开放），以及 [Chad von Nau 在 Stack Overflow 提出的并发问题](https://stackoverflow.com/questions/79979832/how-do-i-use-chrome-devtools-mcp-with-multiple-agents-simultaneously)（[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)）。这些来源不代表市场规模，也不代表对本项目的背书。

示例在当前源码中，固定的 v0.2.6 ZIP 早于此示例。[English](chrome-devtools-isolation.md) · [项目主页](../README.zh-CN.md)
