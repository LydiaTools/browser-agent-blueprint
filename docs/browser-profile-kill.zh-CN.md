# 保存确认后，直接终止浏览器

“保存已确认”不能直接当作抗崩溃持久性凭据。随附的 macOS 实验中，4 次确认后立即
终止浏览器，重启后读到的都是旧记录或没有记录；正常关闭的对照保留了新记录。

一位[读者提出了写入过程中终止进程的问题](https://x.com/lastbrowser/status/2113390616713593177)。
之前的实验测的是 Node 工作进程与显式浏览器快照、检查点文件。这次真实终止
Chromium 浏览器主进程，再打开它自己的临时配置目录，不导入／导出 `storageState`。
边界是**实际保存处理函数返回之后**，仍不是在原生 `setItem` 内部打断写入。

## 运行

使用当前源码、Node 20+ 和 macOS／Linux：

```sh
npm install --ignore-scripts
npx playwright install chromium
npm run demo:browser-kill
```

也可以选择已安装的 Chrome：

```sh
BLUEPRINT_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run demo:browser-kill
```

脚本自己创建回环服务器和一次性浏览器配置目录，不打开日常浏览器、账号或已有
配置。报告写入忽略目录 `runs/browser-profile-kill.json`，实际恢复截图为
`runs/browser-profile-kill-recovered.png`。确认所属进程退出后才清理临时配置；
清理错误会记录并停止，不会宣称已清理。此命令晚于固定 v0.2.2 ZIP，请使用当前源码或 v0.2.3。

## 实际测了什么

1. 给临时目录启动独立浏览器，操作前核对进程组与配置目录参数。
2. 更新场景先保存版本 1 并正常关闭，然后重新打开该配置目录。
3. 同步调用合成页面的实际保存按钮处理函数，写入并读回 localStorage。
   驱动收到该值作为确认。
4. 立即向已核对的浏览器 PID 发送 `SIGKILL`，检查真实退出信号，等待其辅助进程退出。
5. 用不同 PID 的新浏览器打开相同配置目录和来源，读取记录、哈希与页面保存次数；
   读取阶段没有点击保存。

Node 驱动和回环服务器一直运行。没有把快照或期望值写进浏览器配置。页面访问其他
来源会被阻止；浏览器采用一次性无头测试参数。

## 真实 macOS 结果

[原始报告](examples/browser-profile-kill-macos.json)：Chrome 156.0.8078.47、
Node v22.23.0，完成于 2026-10-24T14:48:15.150Z。

| 场景 | 新浏览器读到的结果 | 保存次数 |
| --- | --- | ---: |
| 保存后正常关闭 | 已确认的版本 2 | 1 |
| 保存前终止 | 没有记录 | 0 |
| 全新配置保存确认后终止 | 没有记录 | 0 |
| 更新旧版本 1 后终止，第 1 次 | 版本 1 | 1 |
| 更新旧版本 1 后终止，第 2 次 | 版本 1 | 1 |
| 更新旧版本 1 后终止，第 3 次 | 版本 1 | 1 |

4 次确认后终止中，驱动收到确认至请求终止的实测间隔为 0.012–0.181 ms；不包含
浏览器内部执行和 CDP 返回传输耗时。5 个崩溃场景都记录到真实 `SIGKILL`，全部
读取浏览器 PID 与写入浏览器不同，读取阶段保存调用数为 0。

下面是第 1 次更新场景的新浏览器实拍：写入浏览器已确认版本 2，恢复后却显示
版本 1。图片未经修图，没有虚拟鼠标覆盖层，内容为合成记录。

![重启浏览器读到 Seed version 1，保存次数为 1。](../assets/browser-profile-kill-macos.png)

## 独立 Linux CI 观察

[Linux 原始报告](examples/browser-profile-kill-linux.json)来自
[Checks 40104681290](https://github.com/LydiaTools/browser-agent-blueprint/actions/runs/40104681290)，
Chromium 151.0.7922.34，完成于 2026-10-24T14:57:11.615Z。
下载的浏览器附件完整 SHA-256 与 GitHub 的摘要匹配后，才检查了报告。

该次运行的六项结果相同：正常关闭保留新版本；保存前终止无记录；全新配置确认后
终止无记录；三次更新都退回旧版本。已逐项检查五个真实退出信号、不同读取 PID、
读取阶段零次保存和配置清理。这是两个环境各一组小样，不是总体失败率统计。

## 如何理解报告

`status: observed` 只表示实验完成、两项对照符合预期、崩溃后读值属于完整已知版本
或缺失；不表示新写入成功保留。缺失、旧版本、新版本都会照实记录，异常值或损坏
JSON 会使命令失败。

这组小样不是失败率统计，也不能保证别的浏览器、系统或时序得到相同结果。它没有
在原生存储写入内部终止，没有模拟断电、测试目标服务器或证明恰好执行一次。
任意等待若干毫秒也没有在这里被验证为解决方案。决定是否重写前，先读回目标状态并核对。

[English](browser-profile-kill.md) · [工作进程与快照](crash-boundaries.md) ·
[检查点文件写入](checkpoint-kill.zh-CN.md) · [写前意图与恢复](write-ahead.zh-CN.md)
