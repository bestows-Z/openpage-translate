# 安装与上手

目标环境是桌面 Chrome、Edge 和 Tampermonkey。首版为实验版本，实际验证状态见[验证记录](validation.md)。

## 安装 Tampermonkey

1. 从 [Tampermonkey 官网](https://www.tampermonkey.net/)进入对应浏览器的扩展商店并安装。
2. 打开浏览器的扩展设置。Chrome 使用 `chrome://extensions`，Edge 使用 `edge://extensions`。
3. 在 Tampermonkey 的设置中，按当前浏览器提供的选项允许用户脚本运行。

Tampermonkey 官方说明，基于 Chromium 的浏览器可能需要开启扩展详情中的 **Allow User Scripts / 允许用户脚本**，或开启开发者模式。实际选项随版本变化；请按[官方运行权限说明](https://www.tampermonkey.net/faq.php?ext=mfdh&q=Q209)操作。

## 安装脚本

1. 打开 [`v0.1.0` 试用版本](https://github.com/bestows-Z/openpage-translate/releases/tag/v0.1.0)。
2. 点击附件 `openpage-translate.user.js`，也可以使用[直接安装链接](https://github.com/bestows-Z/openpage-translate/releases/download/v0.1.0/openpage-translate.user.js)。Tampermonkey 应显示安装页面。
3. 核对名称、版本、授权域名及仓库链接，然后确认安装。
4. 在 Tampermonkey 管理面板确认脚本启用，刷新准备翻译的普通网页。

如果浏览器下载了文件而没有显示安装页面，在 Tampermonkey 管理面板使用其本地文件导入方式，或新建脚本并粘贴完整文件内容。无需安装 `.meta.js`，它仅提供版本元数据。

请从本仓库 Release 获取脚本。不要把源码中的单个 `.ts` 文件当作用户脚本安装。

## 第一次翻译

1. 打开一篇普通网页文章，确认右下角出现翻译入口。
2. 打开设置，目标语言默认简体中文，选择适合自己的引擎。
3. 点击翻译操作，或按 **Alt + T**。
4. 浏览器本地引擎首次可能需要下载语言包。若提示不可用，见[本地引擎配置](providers.md)。
5. 点击“还原”或再次按 Alt + T 可还原；“停止”终止请求并保留已经显示的译文。“开始翻译”会按当前设置重新开始。

自动翻译默认关闭。只有主动为当前网站开启规则，之后访问该网站时才会自动开始。禁用规则可用于不希望脚本处理的网站。

划选一段网页文本后，点击附近的浮动翻译按钮查看结果。表单及编辑区中的文本不属于网页翻译目标。

## 设置云引擎凭据

先在页面设置中选择并保存引擎，再打开浏览器工具栏中的 Tampermonkey 菜单，选择“设置当前引擎密钥”。按提示输入 DeepSeek / 兼容服务 API Key，或有道应用 ID 与应用密钥。

页面设置面板只配置引擎、语言、服务地址、模型与站点规则，不显示已有密钥。更换密钥时重新通过菜单输入。凭据仅用于你主动选择的服务，详见[隐私说明](privacy.md)。

## 更新

脚本头的 `@updateURL` 指向最新正式 Release 的 `.meta.js`，`@downloadURL` 指向对应 `.user.js`。该通道由 Tampermonkey 使用，不包含预发布版本。

**当前 `v0.1.0` 是预发布试用版，请从具体版本页面手动安装更新。** 首次正式 Release 发布前，`latest` 更新地址可能不可用。正式版本发布后，可由 Tampermonkey 检查更新，也可手动安装覆盖旧版本。

更新前可查看 [CHANGELOG](../CHANGELOG.md)。如果手动修改了脚本头来授权自定义服务域名，更新后应重新核对该项 `@connect` 是否仍存在。不要通过关闭所有网络授权限制解决更新后的自定义端点问题。

## 从源码安装

```sh
pnpm install --frozen-lockfile
pnpm build
```

将 `dist/openpage-translate.user.js` 导入 Tampermonkey。该方式要求 Node.js 24.13.0 或更新版本，以及项目指定的 pnpm。`dist/` 为生成目录，不提交到 `main`。

## 移除

在 Tampermonkey 管理面板禁用或删除脚本，随后刷新网页即可移除当前页面入口和译文。删除脚本时，按管理器提示处理脚本存储；若只禁用，设置与凭据可能仍保留。已经发送至第三方服务的数据受该服务的保留规则约束。
