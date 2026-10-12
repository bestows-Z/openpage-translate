# 贡献指南

感谢帮助改进 OpenPage Translate。请先用 Issue 说明问题或较大改动的目标，让维护者确认范围。提交问题前可检查[排障指南](docs/troubleshooting.md)与已有 Issue。

## 提交问题

提供浏览器、Tampermonkey、脚本版本、所选引擎、操作步骤、预期与实际结果。优先提供可以公开的最小示例页面，并说明问题是否发生在特定站点。

不要提交 API 密钥、应用密钥、带授权信息的请求头、个人页面内容或未脱敏日志。安全漏洞按 [SECURITY.md](SECURITY.md)处理。

## 单分支贡献方式

目标仓库只保留 `main`。贡献者可在自己的外部 fork 中开发，提供差异、补丁或外部 fork 链接供维护者评审；外部 fork 不增加本仓库分支。维护者在 `main` 应用已评审的改动，不在此仓库建立功能、发布或 `gh-pages` 分支。

不要把内部工作计划、工具配置、测试浏览器资料、真实账户配置或生成目录放入提交。`find.md`、`findings.md`、`task_plan.md`、`progress.md`、`.codex/`、`.agents/`、`.env*`、`node_modules/` 与 `dist/` 均不属于公开源码交付。

## 开发与验证

Node.js 24.13.0 或更新版本；使用 `package.json` 中声明的 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm check:publish
```

安装了桌面 Edge 的环境可执行 `TEST_EDGE=1 pnpm test:e2e`，同时运行 Chromium 与系统 Edge 的页面集成用例；两者均使用 GM 模拟层。

为影响取消、动态 DOM、文本提取、缓存隔离、接口解析或密钥处理的改动增加有意义的回归测试。小型文档或纯样式调整无需添加模仿实现的测试。

保持原文节点与交互；译文只以文本插入，不执行模型返回的 HTML。切换引擎、语言、停止或还原后，旧请求不能写回页面。网站文本是翻译数据，不能作为模型的系统指令。

任何云 API 真实测试应使用测试者自己授权的凭据，并先确认调用成本。常规 CI 使用模拟响应。请准确记录测试环境；不得把 GM 模拟层的测试描述为真实油猴验收。

## 发布

维护者先在 `main` 完成检查与公开文件扫描，再使用与 `package.json` 一致的 `vX.Y.Z` 标签。当前版本手动上传构建附件；可选自动流程位于 `docs/github-actions/`，启用后验证提交属于 `main` 并创建草稿 Release。详见发布指南。

发布前检查实际安装、更新链接、权限、用户流程与[验证记录](docs/validation.md)。若未完成真实浏览器或云账户测试，应明确注明实验状态及未验证范围，不能声称已完成生产兼容性验收。

提交代码表示你有权提供该贡献，并同意按本项目 MIT 许可分发。第三方引入内容需保留原有许可和版权声明。
