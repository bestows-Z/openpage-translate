# 维护者发布说明

本仓库仅保留 `main`。发布以标签和 GitHub Releases 完成，不创建发布分支或 `gh-pages`。

1. 在 `main` 更新版本、变更记录和实际验证状态。
2. 使用锁文件安装依赖，完成 `pnpm check`、`pnpm test:e2e`、`pnpm check:publish`。
3. 检查实际暂存或已跟踪文件，排除内部工作记录、工具目录、用户配置、密钥与生成文件。不能只依赖 `.gitignore`。
4. 完成真实安装和更新验收，或明确标注未完成项与实验状态。
5. 提交并推送 `main`，创建与包版本一致的 `vX.Y.Z` 标签并推送。
6. 当前版本使用 `gh release create` 上传本地检查通过的附件，发布前再次确认目标仓库只有 `main`，标签提交属于 `main`。
7. 检查附件元数据、安装入口、变更说明和验证范围。未满足正式兼容性验收时使用预发布状态。

Release 附件为：

- `openpage-translate.user.js`：可安装的用户脚本。
- `openpage-translate.meta.js`：版本更新元数据。

`dist/` 不提交，附件从锁定依赖及标签源码重新构建。更新地址使用本仓库最新公开 Release 的附件；草稿和预发布不会被“最新正式 Release”入口作为默认更新分发。

发布流程的写权限仅用于创建 Release。维护者需在 GitHub 设置中确认 Actions 可发布，并按实际渠道配置安全报告；不在文档中承诺尚未启用的私密漏洞入口。

## 可选自动化

当前上传凭据没有工作流写入权限，因此 `.github/workflows/` 未启用；完整模板保存在 `docs/github-actions/ci.yml` 和 `release.yml`。后续使用具有工作流写入权限的认证方式，将它们复制到 `.github/workflows/`，核验仓库 Actions 权限后提交到同一个 `main` 分支即可。模板会验证单分支、版本、源码检查及页面测试，并创建草稿 Release；无需额外分支。
