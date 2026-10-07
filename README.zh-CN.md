# Browser Agent Blueprint

**回执丢了，不应再发一遍。**

原创浏览器 Agent 提示词模块，配可复现的本地浏览器恢复 demo。

**12 个 txt 模块 · 4 类工作流 · 6 个演示场景**

维护者：[@LydiaTools](https://github.com/LydiaTools)。
收藏本仓库复用模块，关注账号获取小而可验证的 Agent 工具。
完整技术说明见 [English README](README.md)。

## 解决什么

提交后超时，先核对结果；不能直接重发。点击保存，刷新读取字段后
才算验证。长任务记录已完成操作、未知提交和剩余预算。每次浏览器
调用前检查风险，拆成单条也要累计批量数量。网页指令不能授予权限。

模块覆盖客套废话黑名单、工具失败分级恢复、检查点、暂停与宿主唤醒、
内容录入和社媒状态校验。可按任务拼装，字节统计不冒充 token 节省。

## 直接运行

[在线打开合成测试页](https://lydiatools.github.io/browser-agent-blueprint/demo/fixture.html)，
可保存一条记录、刷新并核对保存次数。网页本身不运行 Agent；下面的本地命令
才会验证宿主侧断点续作和未知提交恢复。

```sh
git clone https://github.com/LydiaTools/browser-agent-blueprint.git
cd browser-agent-blueprint
npm run assemble -- content
npm install
npx playwright install chromium
npm test
npm run demo
npm run demo:prepare
npm run demo:resume
```

需要 Node.js 20+。Linux 必要时用 `npx playwright install --with-deps chromium`。
本地 runner 仅访问 127.0.0.1:4179，使用明确标注的合成记录，不读取已有账号。
运行结果保存在忽略目录 `runs/`。
prepare 退出后，resume 用第二个进程读取检查点、恢复合成页面，并验证
保存次数仍为 1。全场景 demo 有意执行两次保存，不能直接当作该恢复样本。

## 证据边界

这是自研重构、AI 辅助编写的原创模板，不是任何厂商内部泄露提示词，
没有复用 CL4R1T4S 的提示词正文。传播结构参考有明确[出处](docs/provenance.md)。

本地 demo 用真实浏览器和确定性控制器，不调用模型。
它验证宿主控制逻辑，不证明模型服从提示词或能抵抗所有页面注入。
Muse/Grok/Codex 仅提供接入约定，未做对应环境的模型实测。
自动唤醒需要宿主调度器；本项目实现的是手动跨进程恢复。
示例尚不具备写入与检查点之间的崩溃一致性，生产使用须补持久化
提交账本、锁、幂等和真实权限校验。提示词不能扩大上下文或授予工具。

仅操作授权账号与数据，遵守平台自动化规则。不提供验证码绕过、
限流规避、伪造互动或未经授权的批量私信。不承诺工业级可靠性、
token 节省比例、传播效果或 Star 数量。MIT 许可覆盖本仓库原创内容。

[完整模块](prompts/) · [工作流](workflows/) · [实测记录](docs/verification.md)
· [报告可复现失败](https://github.com/LydiaTools/browser-agent-blueprint/issues)
