import { mountUI } from "./ui";
import { loadSettings, saveSettings, saveCredentials } from "./settings/config";
import { registerMenu } from "./platform/gm";
import { TranslationController } from "./translation/controller";

function initialize(): void {
  if (!document.body || document.querySelector('[data-opt-owned="ui"]')) return;
  let settings = loadSettings();
  const controller = new TranslationController();
  const start = () => {
    if (settings.siteRules[location.hostname] === "off") {
      ui.update({
        state: "idle",
        total: 0,
        done: 0,
        failed: 0,
        message: "此网站已设为忽略；修改网站设置后再翻译",
      });
      return;
    }
    ui.cancelSelection();
    controller.start(settings);
  };
  const toggle = () => {
    ui.cancelSelection();
    if (controller.running || document.querySelector("[data-opt-translation]"))
      controller.restore();
    else start();
  };
  const ui = mountUI(settings, {
    start,
    toggle,
    stop: () => controller.stop(),
    restore: () => controller.restore(),
    clearCache: () => controller.clearCache(),
    save: (value) => {
      const changed = JSON.stringify(settings) !== JSON.stringify(value);
      settings = value;
      saveSettings(value);
      if (changed) {
        ui.cancelSelection();
        controller.restore();
      }
    },
    healthCheck: () => controller.healthCheck(settings),
    translateSelection: (text, signal) =>
      controller.translateSelection(text, settings, signal),
  });
  controller.subscribe((progress) => ui.update(progress));
  registerMenu("打开翻译设置", () => ui.open());
  registerMenu("翻译 / 还原页面", toggle);
  registerMenu("设置当前引擎密钥", () => {
    const id = settings.provider;
    if (id === "browser" || id === "ollama") {
      alert("当前本地引擎无需密钥。");
      return;
    }
    if (id === "youdao") {
      const appKey = prompt("有道应用 ID（留空清除；取消保持原值）");
      if (appKey === null) return;
      if (!appKey.trim()) {
        saveCredentials(id, {});
        ui.cancelSelection();
        controller.stop();
        return;
      }
      const appSecret = prompt("有道应用密钥（仅保存在本机油猴存储）");
      if (appSecret === null) return;
      saveCredentials(id, {
        appKey: appKey.trim(),
        appSecret: appSecret.trim(),
      });
    } else {
      const apiKey = prompt("API Key（仅保存在本机油猴存储；留空清除）");
      if (apiKey === null) return;
      saveCredentials(id, { apiKey: apiKey.trim() });
    }
    ui.cancelSelection();
    controller.stop();
    alert("密钥已保存。云 API 可能产生服务商费用，请主动选择使用。");
  });
  registerMenu("清除当前引擎密钥", () => {
    saveCredentials(settings.provider, {});
    ui.cancelSelection();
    controller.stop();
  });
  registerMenu("停止翻译", () => {
    ui.cancelSelection();
    controller.stop();
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const roots = new Set<HTMLElement>();
  const invalidated = new Set<HTMLElement>();
  const observer = new MutationObserver((records) => {
    if (!controller.running) return;
    for (const record of records) {
      const element =
        record.target instanceof HTMLElement
          ? record.target
          : record.target.parentElement;
      if (!element || element.closest("[data-opt-owned]")) continue;
      if (
        record.type === "childList" &&
        [...record.addedNodes, ...record.removedNodes].every(
          (node) =>
            node instanceof HTMLElement && node.hasAttribute("data-opt-owned"),
        )
      )
        continue;
      const root =
        element.closest<HTMLElement>(
          "p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote",
        ) ?? element;
      roots.add(root);
      if (record.type === "attributes") invalidated.add(root);
    }
    if (!roots.size || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      for (const root of invalidated)
        if (root.isConnected) controller.invalidate(root);
      invalidated.clear();
      for (const root of roots) if (root.isConnected) controller.scan(root);
      roots.clear();
    }, 250);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      "hidden",
      "style",
      "class",
      "translate",
      "contenteditable",
      "aria-hidden",
      "lang",
    ],
  });
  let url = location.href;
  const routeTimer = setInterval(() => {
    if (url === location.href) return;
    url = location.href;
    ui.cancelSelection();
    controller.restore();
    roots.clear();
    invalidated.clear();
    if (settings.siteRules[location.hostname] === "auto") start();
  }, 1000);
  window.addEventListener(
    "pagehide",
    () => {
      controller.stop();
    },
    { once: true },
  );
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && settings.siteRules[location.hostname] === "auto")
      start();
  });
  window.addEventListener(
    "unload",
    () => {
      observer.disconnect();
      clearInterval(routeTimer);
      if (timer) clearTimeout(timer);
      ui.destroy();
    },
    { once: true },
  );
  if (settings.siteRules[location.hostname] === "auto") start();
}
initialize();
