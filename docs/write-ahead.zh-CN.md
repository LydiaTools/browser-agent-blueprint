# 保存一次，恢复时先读结果

[English](write-ahead.md) · [完整可运行源码](../demo/write-ahead.cjs)

浏览器可能已保存成功，工作进程却在记录成功前被终止。新进程需要先核对目标端结果。
本示例让目标服务保持运行，真实终止浏览器工作进程。目标端**每次保存都会新增一条**，
没有自动去重。

## 运行

当前源码或 v0.2.1 源码包，Node 20+，macOS/Linux：

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
| 写入前 | DISPATCHED 刷写后、点击前终止进程 | 0 条；标为 ABSENT，不自动重试 |
| 单独选择重试 | 同一操作和哈希，新尝试 ID、新进程 | 1 条；继续累计写入预算 |
| 写入后 | 目标已保存、确认前终止进程 | 1 条；标为 CONFIRMED，不再次保存 |
| 恢复读失败 | 目标读接口返回 503 | 保持 DISPATCHED，不能判作未写入 |
| 已完成后恢复 | 从确认检查点启动新进程 | 仍为 1 条；换动作 ID 也不能重放 |
| 不受控对照 | 明确绕过控制器，连续点击两次保存 | 2 条；验证目标没有帮忙去重 |

查看 `runs/write-ahead-report.json`。对应的 `runs/write-ahead-<时间>-<ID>/`
目录保留初始、终止后、恢复后的检查点，目标记录快照及真实截图。写入后场景还保留
恢复读失败时的状态。ABSENT 后重试是单独明确选择的阶段，不会自动触发。

![新恢复进程读回一条已保存的合成记录。](../assets/write-ahead-desktop.png)

桌面及[手机原始截图](../assets/write-ahead-mobile.png)来自
[CI 39502435888](https://github.com/LydiaTools/browser-agent-blueprint/actions/runs/39502435888)，
提交 `ada2f4d461538e0ccd8cc51b9975da780f0d0aca`。当时通过三个受控场景和读失败注入。
之后增加的不受控对照和中间快照须看[当前 CI](https://github.com/LydiaTools/browser-agent-blueprint/actions/workflows/ci.yml)，
不能算在早期截图那次测试里。没有调用模型或社媒账号。

## 接入约定

`new Controller(scope, savedLedger, { persist })` 可传入持久化回调。
控制器在执行动作前，等待含 DISPATCHED 的账本副本存储完成；确认成功或失败后再次
等待存储。回调必须完成存储后才能返回。示例使用 `writeCheckpoint` 做文件 fsync、
原子重命名和校验回读。不传回调仍使用原有内存模式。

每次写动作同时带上 `operation_id`、`payload_sha256`。首次尝试前生成操作 ID，
恢复时沿用；对相同序列化方式下的准确批准载荷取哈希。可信 intent 还包含业务记录
标识，执行前与批准输入核对。账本绑定哈希、来源、账号、动作种类和影响数量；改变
任一项都会被拦住。新动作 ID 不能绕过已记录操作；只有此前尝试都确认 ABSENT 时，
才允许调用方明确选择新尝试，原预算不退回。不带元数据的旧动作不会自动获得这层
操作去重能力。宿主必须始终复用原操作与账本，另建无关账本不能得到此保护。

独立成功读取目标结果后，使用
`await controller.reconcileAndPersist(actionId, present)`。
配置持久化后不能调用旧的同步 `reconcile`。读取失败、分页不完整、身份不明确或
内容不匹配，都不能作为“不存在”的证据。示例检查读成功、数量和准确的合成标题。

存储失败会冻结当前控制器；检查存储并重新加载已核实状态后才能继续。
持久化模式要求串行调用，同时调用会被拒绝。

## 验证范围

这是宿主侧记录与核对，**不是目标端幂等，也不保证恰好执行一次**。一个父进程持有
任务并顺序启动工作进程；目标服务运行在父进程中，只验证工作进程终止后仍可读回，
没有验证目标自身退出。未实现跨宿主锁、租约、生产账号核验、生产适配器或分布式
事务，没有做断电测试。文件做了 fsync，父目录没有。校验和能发现损坏，不能阻止
有写权限的人重算。真实接入须用能判定业务记录存在与否的读法，按目标能力补幂等
和宿主锁。原有快照演示分别保留，合成 CI 通过只说明实际执行过的场景。
