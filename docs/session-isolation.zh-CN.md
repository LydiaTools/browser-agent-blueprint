# 两个标签页，不一定是两个独立会话

两个 Agent 看起来各有标签页，标签页却可能仍共享 Cookie 和本地存储。做多角色测试时，第二个标签页可能悄悄沿用第一个角色。

[这条公开的 Shuttle 问题](https://github.com/shuttle-browser/shuttle/issues/12)报告了一种具体情况：通过某条 CDP 路径创建的页面共享了状态，而报告者使用 `allocate-tab` 做的对照没有共享。2026 年 10 月 31 日核对时问题仍开放。我们没有在 Shuttle 中复现，不能据此断言它的所有标签或其他浏览器适配器都存在相同问题。

## 在本地试一下

在仓库根目录使用 Node 20+，安装依赖后运行：

```sh
npm install
npx playwright install chromium
npm run demo:session-isolation
```

演示启动临时本地 HTTP 服务和一个新的无头 Playwright Chromium。它向 Cookie 和 localStorage 写入虚构角色，再分别从页面和服务端读取：

| 观察位置 | 预期合成结果 |
| --- | --- |
| 同一浏览器上下文中的第二个标签 | localStorage 和服务端均看到 `agent_a` |
| 独立上下文中的标签，写入前 | 两处均为 `null` |
| 独立上下文写入后，原上下文 | 两处仍为 `agent_a` |
| 独立上下文写入后 | 两处均为 `agent_c` |

断言失败时命令返回非零。它不使用已有浏览器配置或真实账号，结束后会关闭浏览器和服务。实验只覆盖单个本地来源下的 Playwright Chromium 上下文，不代表已测试 Shuttle、CDP 会话适配器、远程浏览器、第三方登录、权限或所有存储机制。报告者在其环境中测试了不同路径；要判断某个适配器，仍需对它单独实测。

## 怎样用于真实测试

使用一次性的测试服务和虚构账号，让每个会话写入不同标记，再从其他会话的页面和服务端分别读取。记录浏览器、适配器、标签创建路径、来源和实际结果。不同的会话名或标签名只是标签，只有实测读回才能说明该次测试发生了什么。不要用生产凭据充当标记。

[返回项目](../README.zh-CN.md) · [English](session-isolation.md)
