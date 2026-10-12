# 第三方声明

OpenPage Translate 的项目代码使用 [MIT License](LICENSE)。该许可不改变第三方软件、服务、模型或商标的许可。

## 分发内容

用户脚本由项目 TypeScript 源码构建，不通过在线 CDN 加载第三方 JavaScript。浏览器语言包、Ollama 程序与模型不包含在仓库或 Release 附件中，由用户自行获取并遵守各自许可。

构建与测试依赖记录在 `package.json` 和 `pnpm-lock.yaml`。安装后，各依赖的许可及版权声明位于对应包的 `LICENSE` / `NOTICE` 文件中；再分发开发环境或依赖时应保留其适用声明。

| 工具                       | 用途              | 许可       |
| -------------------------- | ----------------- | ---------- |
| TypeScript                 | 类型检查          | Apache-2.0 |
| esbuild                    | 用户脚本打包      | MIT        |
| ESLint / typescript-eslint | 静态检查          | MIT        |
| Prettier                   | 格式化            | MIT        |
| Vitest                     | 单元测试          | MIT        |
| jsdom                      | 单元测试 DOM 环境 | MIT        |
| Playwright                 | 浏览器自动化测试  | Apache-2.0 |
| `@types/*`                 | 开发期类型定义    | MIT        |

此表列出直接开发工具；锁文件是实际解析版本与间接依赖的依据。测试浏览器遵循其各自的分发条件，不属于本项目的 MIT 代码。

## 外部服务与模型

- Tampermonkey 为独立的用户脚本管理器，遵守其发布者许可。
- 浏览器本地 Translator API 及语言包遵循浏览器供应商条款。
- Ollama 与下载模型有各自许可；程序的许可不自动覆盖所有模型。
- 有道智云、DeepSeek 和用户配置的兼容服务遵循各自服务条款、隐私规则和计费政策。

本项目独立实现，未复制沉浸式翻译的专有代码、界面资源、商标或标识。文档对产品名称的使用仅为说明兼容环境或服务配置，不构成合作或背书。
