# 上下文压缩后：找回提醒，再核对操作记录

[English](compact-handoff.md)

Agent 发出保存操作，目标已经改变，但回复丢失了。如果此时上下文被压缩，如何避免下一次又保存一遍？

这个 **Node 合成示例**将两个独立部分组合起来：

- **wcf778** 开发的 [Codex Checkpoint](https://github.com/wcf778/codex-checkpoint)，通过模拟的钩子事件带回手动填写的任务提醒。
- 本项目的示例控制器重新读取单独保存的操作记录；上一笔状态为 `UNKNOWN` 时拒绝新写入，并在读取虚构目标后核对结果。

提醒文字本身不能强制执行。只有宿主把写入交给控制器、并恢复正确的操作记录时，示例中的禁止重试才起作用。如果用空记录重试，虚构对照会保存两次。真实宿主仍需保护实际工具、确认任务与账号、持久化自己的记录，并核对真实目标。

## 运行示例

使用当前源码、macOS 或 Linux、Node 20+ 和 `curl`。把外部钩子从固定的上游提交下载到新建临时目录：

```sh
CHECKPOINT_DEMO_DIR=$(mktemp -d)
curl -fsSL 'https://raw.githubusercontent.com/wcf778/codex-checkpoint/162883999177bc9112cd75f648967eccdea2d768/plugins/context-checkpoint/hooks/context-checkpoint.cjs' -o "$CHECKPOINT_DEMO_DIR/context-checkpoint.cjs"
CONTEXT_CHECKPOINT_HOOK="$CHECKPOINT_DEMO_DIR/context-checkpoint.cjs" npm run demo:compact-handoff
```

加载前示例会检查 SHA-256 `1f19bfef7786e0231c3285153fc2da3d63c4bdb3c62d7dbc77d350389dd98dd9`；不一致就停止。外部项目采用 [MIT 许可](https://github.com/wcf778/codex-checkpoint/blob/162883999177bc9112cd75f648967eccdea2d768/LICENSE)，本仓库未打包其代码；运行第三方代码前请自行检查。用完后可删除临时目录。

预期输出包括 `manualSemanticRestore: true`、`unknownRetryBlocked: true`、`afterReadback: "CONFIRMED"`、`effectsWithLedger: 1` 和 `emptyLedgerControlEffects: 2`。

## 验证范围

测试写入虚构对话记录，手动提供虚构的语义状态，调用外部钩子函数，并在**同一 Node 进程**中重新读取本项目的检查点；回读来自内存中的虚构目标。它没有启动 Codex 或浏览器、安装插件、注册钩子、读取真实会话或访问业务账号，也不能证明真实压缩或进程退出后的行为。本测试关闭了 sidecar；它不是“恰好执行一次”或其他宿主的可靠性保证。

示例在 v0.2.6 发行版之后加入当前源码；固定 v0.2.6 ZIP 不包含它。
