import type { Progress, ProviderId, Settings } from "../types";
import { providerIds } from "../settings/config";
import { copyText } from "../platform/gm";

export interface UIActions {
  start(): void;
  toggle(): void;
  stop(): void;
  restore(): void;
  clearCache(): void;
  save(settings: Settings): void;
  healthCheck(): Promise<string>;
  translateSelection(text: string, signal: AbortSignal): Promise<string>;
}
const labels: Record<ProviderId, string> = {
  browser: "浏览器本地 · 实验",
  ollama: "Ollama · 本机模型",
  deepseek: "DeepSeek · 自带密钥",
  openai: "兼容接口 · 自带密钥",
  youdao: "有道 · 自带应用密钥",
};
const languages: [string, string][] = [
  ["zh-Hans", "简体中文"],
  ["zh-Hant", "繁體中文"],
  ["en", "English"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["es", "Español"],
  ["ru", "Русский"],
  ["pt", "Português"],
  ["it", "Italiano"],
];
export function mountUI(
  initial: Settings,
  actions: UIActions,
): {
  update(progress: Progress): void;
  open(): void;
  cancelSelection(): void;
  destroy(): void;
} {
  let settings = structuredClone(initial);
  let selectionAbort = new AbortController();
  let selectionGeneration = 0;
  let capturedSelection = "";
  const host = document.createElement("div");
  host.setAttribute("data-opt-owned", "ui");
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    :host{all:initial;--bg:#fff;--text:#172b3d;--muted:#526377;--border:#dbe3ed;--primary:#2458cf;--soft:#f3f6fb;color-scheme:light;}
    *{box-sizing:border-box} [hidden]{display:none!important}
    .app{font:14px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text)}
    button,input,select{font:inherit;color:inherit}button{cursor:pointer;min-height:44px;border:1px solid var(--border);border-radius:9px;padding:8px 12px;background:var(--bg)}
    button:hover{background:var(--soft)}button:active{transform:translateY(1px)}button:disabled{opacity:.55;cursor:wait}button.primary{background:var(--primary);color:white;border-color:var(--primary)}
    :focus-visible{outline:3px solid #68a0ff;outline-offset:2px}
    .launcher{position:fixed;right:20px;bottom:24px;width:48px;height:48px;border-radius:16px;background:var(--primary);color:white;border:0;font-size:22px;font-weight:700;box-shadow:0 6px 22px #172b3d25;z-index:2147483646}
    .panel{position:fixed;right:20px;bottom:84px;width:350px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 108px);overflow:auto;background:var(--bg);border:1px solid var(--border);border-radius:16px;box-shadow:0 16px 60px #172b3d30;padding:20px;z-index:2147483646}
    header{display:flex;justify-content:space-between;align-items:center;gap:12px}header button{border:0;padding:6px;font-size:20px}h2{font-size:18px;margin:0}.eyebrow{font-size:10px;letter-spacing:1.5px;color:var(--muted);font-weight:700}.intro{color:var(--muted);margin:10px 0 18px;font-size:13px}
    label{display:block;font-size:12px;font-weight:600;margin:12px 0 6px}input,select{display:block;width:100%;min-height:42px;padding:8px;border:1px solid var(--border);border-radius:7px;background:var(--bg)}
    .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.actions button{flex:1;white-space:nowrap}.status{padding:12px;border-radius:8px;background:var(--soft);margin-top:14px;font-size:12px;overflow-wrap:anywhere}.hint{font-size:12px;color:var(--muted);margin:12px 0}.link{color:var(--primary)}
    details{border-top:1px solid var(--border);margin-top:16px;padding-top:12px}summary{cursor:pointer;min-height:32px;font-weight:600;font-size:13px}.selection{position:fixed;max-width:min(360px,calc(100vw - 24px));background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:12px;box-shadow:0 10px 40px #172b3d25;z-index:2147483647;overflow-wrap:anywhere}.result{white-space:pre-wrap;margin-top:10px;max-height:220px;overflow:auto}.selection .row{display:flex}
    @media(prefers-color-scheme:dark){:host{--bg:#17212f;--text:#e6edf7;--muted:#acbbcf;--border:#364357;--primary:#648eff;--soft:#233044;color-scheme:dark}.primary{color:#101b2d!important}}
    @media(max-width:400px){.panel{right:12px;padding:16px}.launcher{right:12px}}
    @media(prefers-reduced-motion:reduce){button:active{transform:none}}
  `;
  shadow.append(style);
  const app = document.createElement("div");
  app.className = "app";
  // Static markup contains no page text, user settings or credentials.
  app.innerHTML = `<button class="launcher" type="button" aria-label="打开 OpenPage 翻译设置" aria-expanded="false">译</button>
    <section class="panel" hidden aria-label="OpenPage 翻译设置">
      <header><div><div class="eyebrow">OPENPAGE / READ TOGETHER</div><h2>双语阅读</h2></div><button type="button" data-action="close" aria-label="关闭设置">×</button></header>
      <p class="intro">保留原文，逐段理解。插件全部功能免费。</p>
      <label for="engine">翻译引擎</label><select id="engine"></select>
      <div class="row"><div><label for="source">原文语言</label><select id="source"></select></div><div><label for="target">译文语言</label><select id="target"></select></div></div>
      <p class="hint" id="engine-hint"></p>
      <div class="actions"><button class="primary" type="button" data-action="start">开始翻译</button><button type="button" data-action="stop">停止</button><button type="button" data-action="restore">还原</button></div>
      <div class="status" role="status" aria-live="polite">准备就绪</div>
      <details><summary>引擎与网站设置</summary>
        <div id="endpoint-field"><label for="endpoint">服务地址</label><input id="endpoint" type="url" autocomplete="off" spellcheck="false"></div>
        <div id="model-field"><label for="model">模型名称</label><input id="model" autocomplete="off" spellcheck="false"></div>
        <label for="site">当前网站</label><select id="site"><option value="manual">手动翻译</option><option value="auto">自动翻译</option><option value="off">忽略此网站</option></select>
        <div class="actions"><button type="button" data-action="save">保存设置</button><button type="button" data-action="check">检查连接</button></div>
        <p class="hint">密钥请通过油猴菜单“设置当前引擎密钥”输入。自定义服务需在油猴脚本头添加对应域名的 @connect。云 API 可能收费。</p>
        <button type="button" data-action="cache">清除本页缓存</button>
      </details>
      <p class="hint">Alt + T 翻译 / 还原 · 选中文字可划词翻译<br><a class="link" href="https://github.com/bestows-Z/openpage-translate" target="_blank" rel="noopener noreferrer">开源项目与使用说明</a></p>
    </section>
    <aside class="selection" hidden aria-label="划词翻译"><div class="row"><button class="primary" type="button" data-action="selection">翻译选中文字</button><button type="button" data-action="selection-copy" hidden>复制</button><button type="button" data-action="selection-close" aria-label="关闭划词翻译">×</button></div><div class="result" role="status" aria-live="polite"></div></aside>`;
  shadow.append(app);
  document.documentElement.append(host);
  const query = <T extends Element>(selector: string) =>
    app.querySelector<T>(selector)!;
  const engine = query<HTMLSelectElement>("#engine");
  const source = query<HTMLSelectElement>("#source");
  const target = query<HTMLSelectElement>("#target");
  const endpoint = query<HTMLInputElement>("#endpoint");
  const model = query<HTMLInputElement>("#model");
  const site = query<HTMLSelectElement>("#site");
  const panel = query<HTMLElement>(".panel");
  const launcher = query<HTMLButtonElement>(".launcher");
  const status = query<HTMLElement>(".status");
  const selection = query<HTMLElement>(".selection");
  const result = query<HTMLElement>(".result");
  for (const id of providerIds) engine.add(new Option(labels[id], id));
  source.add(new Option("自动识别", "auto"));
  for (const [code, name] of languages) {
    source.add(new Option(name, code));
    target.add(new Option(name, code));
  }
  function displaySettings(): void {
    engine.value = settings.provider;
    source.value = settings.sourceLanguage;
    target.value = settings.targetLanguage;
    endpoint.value = settings.providers[settings.provider].endpoint;
    model.value = settings.providers[settings.provider].model;
    site.value = settings.siteRules[location.hostname] ?? "manual";
    query<HTMLElement>("#endpoint-field").hidden =
      settings.provider === "browser" || settings.provider === "youdao";
    query<HTMLElement>("#model-field").hidden =
      settings.provider === "browser" || settings.provider === "youdao";
    query<HTMLElement>("#engine-hint").textContent =
      settings.provider === "browser"
        ? "本地翻译需要浏览器支持并下载语言包。不可用时请切换 Ollama；必要时手动指定原文语言。"
        : settings.provider === "ollama"
          ? "需先安装 Ollama 和本地模型，不产生第三方 API 调用费用。"
          : settings.provider === "youdao"
            ? "使用有道智云官方 API。体验额度耗尽后可能收费。"
            : "使用你自己的服务账户与密钥，API 费用由服务商决定。";
  }
  function readSettings(): Settings {
    const value = structuredClone(settings);
    value.sourceLanguage = source.value;
    value.targetLanguage = target.value;
    value.providers[value.provider] = {
      endpoint: endpoint.value.trim(),
      model: model.value.trim(),
    };
    if (site.value === "manual") delete value.siteRules[location.hostname];
    else value.siteRules[location.hostname] = site.value as "auto" | "off";
    return value;
  }
  function save(): void {
    settings = readSettings();
    actions.save(settings);
  }
  function open(): void {
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    engine.focus();
  }
  function close(): void {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }
  launcher.addEventListener("click", () => (panel.hidden ? open() : close()));
  engine.addEventListener("change", () => {
    settings = readSettings();
    settings.provider = engine.value as ProviderId;
    displaySettings();
  });
  app.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLButtonElement>(
      "[data-action]",
    )?.dataset.action;
    if (!action) return;
    if (action === "close") close();
    else if (action === "start") {
      save();
      actions.start();
    } else if (action === "stop") {
      hideSelection();
      actions.stop();
    } else if (action === "restore") {
      hideSelection();
      actions.restore();
    } else if (action === "cache") actions.clearCache();
    else if (action === "save") {
      save();
      status.textContent = "设置已保存；再次开始翻译以应用";
    } else if (action === "check") {
      save();
      const button = event.target as HTMLButtonElement;
      button.disabled = true;
      status.textContent = "检查中…";
      void actions
        .healthCheck()
        .then(
          (text) => {
            status.textContent = text;
          },
          () => {
            status.textContent = "连接检查失败，请检查服务及授权。";
          },
        )
        .finally(() => {
          button.disabled = false;
        });
    } else if (action === "selection-close") hideSelection();
    else if (action === "selection-copy") {
      const button = query<HTMLButtonElement>('[data-action="selection-copy"]');
      void copyText(result.textContent ?? "").then(
        () => {
          button.textContent = "已复制";
        },
        () => {
          button.textContent = "复制失败";
        },
      );
    } else if (action === "selection") {
      save();
      selection.hidden = false;
      selectionAbort.abort();
      selectionAbort = new AbortController();
      const generation = ++selectionGeneration;
      result.textContent = "翻译中…";
      void actions
        .translateSelection(capturedSelection, selectionAbort.signal)
        .then(
          (text) => {
            if (generation === selectionGeneration) {
              result.textContent = text;
              const button = query<HTMLButtonElement>(
                '[data-action="selection-copy"]',
              );
              button.hidden = false;
              button.textContent = "复制";
            }
          },
          () => {
            if (generation === selectionGeneration)
              result.textContent =
                "划词翻译失败，请检查设置或手动指定原文语言。";
          },
        );
    }
  });
  function hideSelection(): void {
    selection.hidden = true;
    selectionGeneration++;
    selectionAbort.abort();
  }
  const onSelection = (event: MouseEvent) => {
    if (event.composedPath().includes(host)) return;
    const selected = window.getSelection();
    const anchor = selected?.anchorNode?.parentElement;
    if (
      anchor?.closest(
        'input,textarea,[contenteditable]:not([contenteditable="false"]),[data-opt-owned]',
      )
    ) {
      hideSelection();
      return;
    }
    const text = selected?.toString().trim() ?? "";
    if (!text || text.length > 5000) {
      hideSelection();
      return;
    }
    hideSelection();
    capturedSelection = text;
    result.textContent = "";
    query<HTMLElement>('[data-action="selection-copy"]').hidden = true;
    selection.hidden = false;
    selection.style.left = `${Math.max(12, Math.min(event.clientX, innerWidth - 370))}px`;
    selection.style.top = `${Math.max(12, Math.min(event.clientY + 12, innerHeight - 180))}px`;
  };
  const onKey = (event: KeyboardEvent) => {
    const path = event.composedPath();
    const editing = path.some(
      (node) =>
        node instanceof HTMLElement &&
        (node.matches("input,textarea,select") || node.isContentEditable),
    );
    if (event.key === "Escape") {
      if (!panel.hidden) close();
      hideSelection();
    } else if (
      event.altKey &&
      event.key.toLowerCase() === "t" &&
      !editing &&
      !event.repeat
    ) {
      event.preventDefault();
      save();
      actions.toggle();
    }
  };
  document.addEventListener("mouseup", onSelection);
  shadow.addEventListener("keydown", (event) => {
    const key = event as KeyboardEvent;
    if (
      key.altKey &&
      key.key.toLowerCase() === "t" &&
      (key.target as Element).matches("input,textarea,select")
    )
      key.stopPropagation();
  });
  document.addEventListener("keydown", onKey);
  displaySettings();
  return {
    open,
    cancelSelection: hideSelection,
    update(progress) {
      status.textContent = `${progress.message}${progress.total ? ` · 完成 ${progress.done}/${progress.total}${progress.failed ? `，失败 ${progress.failed}` : ""}` : ""}`;
    },
    destroy() {
      hideSelection();
      document.removeEventListener("mouseup", onSelection);
      document.removeEventListener("keydown", onKey);
      host.remove();
    },
  };
}
