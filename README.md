# OpenPage Translate

[English](README.en.md) · [安装指南](docs/install.md) · [引擎配置](docs/providers.md) · [隐私说明](docs/privacy.md) · [问题排查](docs/troubleshooting.md)

免费、开源的油猴网页翻译脚本。按段落在原文下方显示译文，保留网页原有链接和交互，支持划词翻译与动态内容。

项目独立实现代码和界面，与沉浸式翻译、有道、DeepSeek、Tampermonkey 等第三方项目或服务没有隶属关系。

![OpenPage Translate 双语阅读与设置面板演示](docs/screenshot.png)

演示使用公开测试页面与模拟引擎，译文为预设结果，仅展示双语排版和界面布局，不代表真实引擎的翻译质量。

## 免费范围

**插件全部功能永久免费，不设会员、广告、项目账号或公共翻译中转服务器。** 翻译引擎的费用与插件分开：

| 引擎                             | API 费用            | 使用条件                                                                         |
| -------------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| 浏览器本地翻译（默认，实验功能） | 无云 API 调用费     | 浏览器及页面环境支持 Translator API；首次可能下载语言包                          |
| Ollama 本地模型                  | 无第三方 API 调用费 | 自行安装 Ollama、下载本地模型并运行本机服务；设备、电力和存储由用户承担          |
| 有道智云                         | 免费体验后可能收费  | 自带应用 ID 和应用密钥；有道官方当前说明新用户获赠 50 元体验资金，耗尽后按量扣费 |
| DeepSeek / OpenAI 兼容服务       | 依服务商规则        | 自带密钥、服务地址及模型                                                         |

有道网页或应用中的免费翻译体验，与提供给程序调用的官方开放平台 API 是不同产品。项目使用官方 API，不把网页私有接口当作稳定的免费服务。体验额度及价格以[有道官方定价](https://ai.youdao.com/DOCSIRMA/html/trans/price/wbfy/index.html)为准。DeepSeek 的接口规则见[官方定价](https://api-docs.deepseek.com/quick_start/pricing/)。

默认关闭自动翻译。免费引擎不可用时会提示配置，**不会自动切换到收费引擎**。Ollama 的免费路径限定本地模型；通过本机服务调用云模型，仍须遵循其服务规则。

## 安装与第一次翻译

1. 在桌面 Chrome 或 Edge 安装 [Tampermonkey](https://www.tampermonkey.net/)，按其提示允许用户脚本运行。
2. 安装 [`v0.1.0` 试用脚本](https://github.com/bestows-Z/openpage-translate/releases/download/v0.1.0/openpage-translate.user.js)，或到[版本页面](https://github.com/bestows-Z/openpage-translate/releases/tag/v0.1.0)获取附件。请从本仓库获取脚本。
3. 打开普通网页，点击右下角翻译入口中的设置，选择目标语言；默认是简体中文。
4. 点击“开始翻译”或按 **Alt + T**。原文下方逐段出现译文；点击“还原”或再次按 Alt + T 可还原。
5. 若浏览器本地翻译不可用，按[引擎配置](docs/providers.md)启用 Ollama，或主动配置有道、DeepSeek。

云服务密钥通过 **Tampermonkey 菜单**设置；页面设置面板不显示密钥。`.meta.js` 用于更新检查，不是独立安装脚本。当前预发布版本请手动安装更新；首次正式 Release 发布前，脚本中的 `latest` 更新通道可能不可用。详细步骤见[安装指南](docs/install.md)。

## 功能

- 网页段落双语显示、单段重试、停止与还原。
- 划选文本后点击浮动翻译按钮，在弹窗中查看和复制译文。
- 动态新增内容扫描、可视区域优先、请求限流与当前页面内存缓存。
- 源语言自动判断或手动指定、目标语言切换。
- 按网站保存自动翻译或禁用规则。
- 本地浏览器、Ollama、有道、DeepSeek、基础 OpenAI 兼容接口。

源语言自动判断取决于所选引擎与页面环境，混合语言或识别失败时请手动选择。基础兼容接口要求服务支持 Chat Completions 和结构化 JSON 输出，不保证所有标称兼容的服务都能工作。

## 兼容范围与验证

目标环境为桌面 **Chrome / Edge + Tampermonkey**。`v0.1.0` 是首个实验版本。已通过 87 项单元测试，以及 Chromium、系统 Edge 各 10 项页面测试（每个浏览器含 1 项演示截图）。页面测试使用 GM 模拟层，真实 Tampermonkey 安装、Ollama 与云账户尚未完成验收。环境与范围见[验证记录](docs/validation.md)。

浏览器本地 API 通过运行时检测启用；浏览器版本、HTTPS、语言包、网站权限策略及油猴运行上下文均可能影响可用性。详见 [Chrome 文档](https://developer.chrome.com/docs/ai/translator-api)与 [Edge 文档](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/translator-api)。

首版处理普通 DOM 文本，跳过代码、输入区、编辑区、隐藏内容及 `translate="no"` 内容。PDF、图片 OCR、视频字幕、Canvas 文本、跨域 iframe、封闭 Shadow DOM、浏览器内部页面与扩展商店页面不在当前支持范围。特殊网站布局和虚拟列表可能需要后续适配。

## 隐私与权限

仅在用户触发或已开启站点自动翻译时处理网页文本。本地浏览器引擎在浏览器内处理；Ollama 将文本发送到配置的本机服务；云引擎将待翻译文本发送至所选服务商。选择云引擎前，请确认网页内容可以发送给该服务。

密钥保存在 Tampermonkey 脚本存储中，不写入网站 `localStorage`、网页公开 DOM、源码或 URL。GM 存储并非硬件密钥库。项目不收集遥测、不运营翻译代理，不上传翻译缓存。跨域请求及自定义域名授权的用途见[隐私说明](docs/privacy.md)。

## 本地开发

需要 Node.js **24.13.0 或更新版本**及 `package.json` 中指定的 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
pnpm check:publish
```

已安装桌面 Edge 时，可使用 `TEST_EDGE=1 pnpm test:e2e` 一并运行该浏览器的模拟页面测试。该测试仍使用 GM 模拟层。

```sh
pnpm build
```

构建产物为 `dist/openpage-translate.user.js` 与 `dist/openpage-translate.meta.js`，可在 Tampermonkey 中安装本地构建的用户脚本。`dist/` 不提交到仓库，正式分发使用 Release 附件。

| 目录                   | 用途                                    |
| ---------------------- | --------------------------------------- |
| `src/`                 | 页面处理、引擎适配、GM 封装、设置与界面 |
| `tests/`               | 单元测试与模拟页面集成测试              |
| `scripts/`             | 构建、元数据与公开文件检查              |
| `docs/`                | 面向用户和维护者的公开文档              |
| `.github/`             | Issue 模板                              |
| `docs/github-actions/` | 可启用的检查与标签发布工作流模板        |

## 贡献与发布

仓库只保留 **`main` 一个分支**。版本用标签及 Releases 分发；当前版本使用本地检查和手动发布，不创建发布分支或 `gh-pages`。自动检查与标签发布配置保留在 `docs/github-actions/`，启用方法见[发布指南](docs/releasing.md)。

欢迎通过 [Issues](https://github.com/bestows-Z/openpage-translate/issues)报告问题、提出需求，或提供外部 fork / 补丁。请先阅读[贡献指南](CONTRIBUTING.md)与[行为准则](CODE_OF_CONDUCT.md)。安全问题按[安全政策](SECURITY.md)报告；请勿在公开 Issue 中提交密钥或含个人信息的网页。

变更见 [CHANGELOG](CHANGELOG.md)。本项目采用 [MIT License](LICENSE)，第三方服务、依赖与模型的许可见[第三方声明](THIRD_PARTY_NOTICES.md)。
