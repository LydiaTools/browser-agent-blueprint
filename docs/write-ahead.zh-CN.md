# 保存一次，恢复时先读结果

[English](write-ahead.md) · [完整可运行源码](../demo/write-ahead.cjs)

浏览器可能已保存成功，工作进程却在记录成功前被终止。新进程需要先核对目标端结果。
本示例让目标服务保持运行，真实终止浏览器工作进程。目标端**每次保存都会新增一条**，
没有自动去重。

## 运行

当前源码或 v0.2.2 源码包，Node 20+，macOS/Linux：

```sh
npm install
npx playwright install chromium
npm test
npm run demo:write-ahead
```

Linux 必要时用 `npx playwright install --with-deps chromium`。
自动选择空闲回环端口，只用合成记录和全新浏览器上下文，不读取已登录配置；
场景结束后退出。此 SIGKILL runner 不支持 Windows。

## 核对结果

| 场景 | 中断或操作 | 预期读回 |
|---|---|---|
| 写入前 | DISPATCHED 刷写后、点击前终止进程 | 新进程读回 0 条并先进入 PENDING_REVIEW；人工标记 not_landed 后才可单独选择重试 |
| 单独选择重试 | 同一操作和哈希，新尝试 ID、新进程 | 1 条；继续累计写入预算 |
| 写入后 | 目标已保存、确认前终止进程 | 新进程读回 1 条并进入 PENDING_REVIEW；人工标记 landed，不再次保存 |
| 恢复读失败 | 目标读接口返回 503 | 保持 DISPATCHED，不能判作未写入 |
| 已完成后恢复 | 从确认检查点启动新进程 | 仍为 1 条；换动作 ID 也不能重放 |
| 不受控对照 | 明确绕过控制器，连续点击两次保存 | 2 条；验证目标没有帮忙去重 |

查看 `runs/write-ahead-report.json`。对应的 `runs/write-ahead-<时间>-<ID>/`
目录保留初始、终止后、恢复后的检查点，目标记录快照及真实截图。写入后场景还保留
恢复读失败时的状态。审核记录包含观察来源、引用与哈希；示例审核人是合成测试值，不代表
项目验证了真实身份认证。ABSENT 后重试是单独明确选择的阶段，不会自动触发。

![新恢复进程读回一条已保存的合成记录。](../assets/write-ahead-desktop.png)

桌面及[手机原始截图](../assets/write-ahead-mobile.png)来自
[CI 39502435888](https://github.com/LydiaTools/browser-agent-blueprint/actions/runs/39502435888)，
提交 `ada2f4d461538e0ccd8cc51b9975da780f0d0aca`。当时通过三个受控场景和读失败注入。
之后增加的不受控对照和中间快照须看[当前 CI](https://github.com/LydiaTools/browser-agent-blueprint/actions/workflows/ci.yml)，
不能算在早期截图那次测试里。没有调用模型或社媒账号。

## 接入约定

`new Controller(scope, savedLedger, { persist, requireHumanReview: true })` 启用严格恢复模式，
要求持久化，并要求每次写入都有稳定操作 ID 和载荷 SHA-256。
每次写入还必须带可恢复到同一份获批载荷的持久化引用。
控制器在执行动作前，等待含 DISPATCHED 的账本副本存储完成；确认成功或失败后再次
等待存储。回调必须完成存储后才能返回。示例使用 `writeCheckpoint` 做文件 fsync、
原子重命名和校验回读。不传回调仍使用原有内存模式。

每次写动作同时带上 `operation_id`、`payload_sha256` 和 `payload_ref`。首次尝试前生成操作 ID，
恢复时沿用；对相同序列化方式下的准确批准载荷取哈希。载荷引用在恢复后必须仍指向同一份不可变获批输入。
示例把无敏感信息的合成载荷快照写入检查点，并绑定业务记录标识。生产密钥和敏感内容应留在受保护的宿主存储中，检查点只保留不透明引用与哈希。账本绑定哈希、来源、账号、动作种类和影响数量；改变
任一项都会被拦住。新动作 ID 不能绕过已记录操作；只有此前尝试都确认 ABSENT 时，
才允许调用方明确选择新尝试，原预算不退回。不带元数据的旧动作不会自动获得这层
操作去重能力。宿主必须始终复用原操作与账本，另建无关账本不能得到此保护。

严格恢复模式先保存独立读回，再提交审核决定：

```js
await controller.recordRecoveryObservation(actionId, {
  outcome: 'present', // 或 absent / inconclusive
  source: 'destination-read',
  reference: '/records?reference=draft-1',
  observed_at: new Date().toISOString(),
  evidence_sha256: sha256OfTheReadback,
});
await controller.reviewAndReconcile(actionId, {
  decision: 'landed', // 或 not_landed / unresolved
  reviewer: authenticatedReviewerId,
  reason: '已将目标记录与获批草稿逐项核对。',
  reviewed_at: new Date().toISOString(),
});
```

状态为 `PENDING_REVIEW` 时写入仍被阻止。`landed` 必须对应 present，`not_landed` 必须对应
absent；`unresolved` 继续阻止写入。严格模式拒绝旧的布尔协调方法。读取失败、分页不完整、
身份不明确或内容不匹配，都不能作为“不存在”的证据。宿主必须认证审核人，并只从人工审核流程
调用决定接口；库只记录宿主传入的审核人标识，本身不能验证身份。示例检查读成功、数量与合成标题。

超时后立刻读到零条，只代表当时的结果：原请求可能仍在执行并稍后写入，读到的数据也可能
滞后。除非宿主能确认原操作不可能再提交，且读回覆盖了目标记录，否则应记录为 `inconclusive`，
继续阻止写入。单纯等待一段时间不能证明这些条件。控制器只记录宿主的判断，不能自己发现
仍在执行的请求或验证审核结论；旧的布尔协调方法同样受此限制。

相关独立报告：[browser-harness #869](https://github.com/browser-use/browser-harness/issues/869)
描述了 IPC 超时后浏览器操作仍可能继续，一位评论者展示了本地重复提交的例子。
关联 [PR #873](https://github.com/browser-use/browser-harness/pull/873) 在 2026-11-01 核查时
仍在审阅；我们没有独立复现该报告，也没有验证其补丁。

存储失败会冻结当前控制器；检查存储并重新加载已核实状态后才能继续。
持久化模式要求串行调用，同时调用会被拒绝。

## 验证范围

这是宿主侧记录与人工审核门禁，**不是目标端幂等，也不保证恰好执行一次**。一个父进程持有
任务并顺序启动工作进程；目标服务运行在父进程中，只验证工作进程终止后仍可读回，
没有验证目标自身退出。未实现跨宿主锁、租约、生产账号核验、生产适配器或分布式
事务，没有做断电测试。文件做了 fsync，父目录没有。校验和能发现损坏，不能阻止
有写权限的人重算。真实接入须用能判定业务记录存在与否的读法，按目标能力补幂等
和宿主锁。原有快照演示分别保留，合成 CI 通过只说明实际执行过的场景。
