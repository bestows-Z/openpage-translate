import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

type Harness = Window & {
  __root: ShadowRoot;
  __calls: number;
  __delay: number;
  __menus: Record<string, () => void>;
  __aborts: number;
  __clipboard: string;
};
test.beforeAll(async ({ browser }, info) => {
  console.log(`${info.project.name}: ${browser.version()}`);
});
async function clickControl(page: Page, selector: string) {
  const position = await page.evaluate((value) => {
    const element = (
      window as unknown as Harness
    ).__root.querySelector<HTMLElement>(value)!;
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, selector);
  await page.mouse.click(position.x, position.y);
}
test.beforeEach(async ({ page }) => {
  const fixture = await readFile("tests/fixtures/article.html", "utf8");
  await page.route("https://fixture.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: fixture }),
  );
  await page.addInitScript(() => {
    const w = window as unknown as Harness;
    w.__calls = 0;
    w.__delay = 0;
    w.__menus = {};
    w.__aborts = 0;
    w.__clipboard = "";
    const original = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      const root = original.call(this, options);
      if (this.hasAttribute("data-opt-owned")) w.__root = root;
      return root;
    };
    const values: Record<string, unknown> = {
      settings: {
        version: 1,
        provider: "openai",
        sourceLanguage: "en",
        targetLanguage: "zh-Hans",
        concurrency: 2,
        siteRules: {},
        providers: {
          openai: { endpoint: "https://mock.test/v1", model: "fixture-model" },
        },
      },
      "credentials:openai": { apiKey: "test-only-not-real" },
      "credentials:youdao": {
        appKey: "fixture-app",
        appSecret: "fixture-secret",
      },
    };
    Object.assign(window, {
      GM_getValue: (key: string, fallback: unknown) => values[key] ?? fallback,
      GM_setValue: (key: string, value: unknown) => {
        values[key] = value;
      },
      GM_registerMenuCommand: (label: string, handler: () => void) => {
        w.__menus[label] = handler;
      },
      GM_setClipboard: (text: string) => {
        w.__clipboard = text;
      },
      GM_xmlhttpRequest: (options: {
        data: string;
        onload(value: unknown): void;
        onabort(): void;
      }) => {
        w.__calls++;
        if (!options.data.startsWith("{")) {
          const timer = setTimeout(
            () =>
              options.onload({
                status: 200,
                responseText: JSON.stringify({
                  errorCode: "0",
                  translation: ["有道模拟译文"],
                }),
              }),
            w.__delay,
          );
          return {
            abort: () => {
              w.__aborts++;
              clearTimeout(timer);
              options.onabort();
            },
          };
        }
        const body = JSON.parse(options.data);
        const segments = JSON.parse(body.messages[1].content).segments as {
          id: string;
          text: string;
        }[];
        const target = body.messages[0].content.includes(" to ja.")
          ? "日文"
          : "中文";
        const demo: Record<string, string> = {
          "OPEN WEB / SHARED KNOWLEDGE": "开放网络 / 共享知识",
          "Read the world, one paragraph at a time.":
            "逐段阅读，看见更大的世界。",
          "Learning a new language starts with curiosity. Keep the original text and explore its meaning alongside a translation.":
            "学习一门新语言始于好奇。保留原文，结合译文探索它的含义。",
          "Open tools help people learn together. Visit the original source and continue exploring.":
            "开放工具让人们共同学习。访问原始来源，继续探索。",
          "Preserve the source and its links.": "保留原文及其链接。",
          "Translate only the text you choose.": "只翻译你选择的文本。",
          "Local translation": "本地翻译",
          "No cloud API fee": "无云端 API 调用费用",
        };
        const timer = setTimeout(
          () =>
            options.onload({
              status: 200,
              responseText: JSON.stringify({
                choices: [
                  {
                    finish_reason: "stop",
                    message: {
                      content: JSON.stringify({
                        translations: segments.map((s) => ({
                          id: s.id,
                          text: `${target}译文：${demo[s.text] ?? s.text}`,
                        })),
                      }),
                    },
                  },
                ],
              }),
            }),
          w.__delay,
        );
        return {
          abort: () => {
            w.__aborts++;
            clearTimeout(timer);
            options.onabort();
          },
        };
      },
    });
  });
  await page.goto("https://fixture.test/article");
  await page.addScriptTag({ path: "dist/openpage-translate.user.js" });
  await clickControl(page, ".launcher");
});
test("bilingual translation preserves links and restores the page", async ({
  page,
}) => {
  await page.evaluate(() => {
    document.querySelector("#source-link")!.addEventListener("click", () => {
      document
        .querySelector("#source-link")!
        .setAttribute("data-clicked", "yes");
    });
  });
  await clickControl(page, '[data-action="start"]');
  await expect(page.locator("#article [data-opt-translation]")).toContainText(
    "中文译文",
  );
  await expect(page.locator("pre [data-opt-translation]")).toHaveCount(0);
  await page.locator("#source-link").click();
  await expect(page.locator("#source-link")).toHaveAttribute(
    "data-clicked",
    "yes",
  );
  await clickControl(page, '[data-action="restore"]');
  await expect(page.locator("[data-opt-translation]")).toHaveCount(0);
  await expect(page.locator('input[aria-label="Untouched input"]')).toHaveValue(
    "Do not translate me",
  );
});
test("start applies a changed language instead of restoring the old translation", async ({
  page,
}) => {
  await clickControl(page, '[data-action="start"]');
  await expect(page.locator("#article [data-opt-translation]")).toContainText(
    "中文译文",
  );
  await page.evaluate(() => {
    (window as unknown as Harness).__root.querySelector<HTMLSelectElement>(
      "#target",
    )!.value = "ja";
  });
  await clickControl(page, '[data-action="start"]');
  await expect(page.locator("#article [data-opt-translation]")).toContainText(
    "日文译文",
  );
});
test("translates newly visible and dynamically added text", async ({
  page,
}) => {
  await clickControl(page, '[data-action="start"]');
  await expect(page.locator("#article [data-opt-translation]")).not.toHaveCount(
    0,
  );
  await page.evaluate(() => {
    document.querySelector("#hidden")!.classList.remove("hidden");
    const p = document.createElement("p");
    p.id = "new";
    p.textContent = "A new paragraph";
    document.querySelector("#dynamic")!.append(p);
  });
  await expect(page.locator("#hidden [data-opt-translation]")).toContainText(
    "中文译文",
  );
  await expect(page.locator("#new [data-opt-translation]")).toContainText(
    "中文译文",
  );
});
test("stops pending translations and prevents late insertion", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as unknown as Harness).__delay = 700;
  });
  await clickControl(page, '[data-action="start"]');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Harness).__calls))
    .toBeGreaterThan(0);
  await clickControl(page, '[data-action="stop"]');
  await page.waitForTimeout(900);
  await expect(page.locator("[data-opt-translation]")).toHaveCount(0);
});
test("settings contain no credentials and render in a closed shadow root", async ({
  page,
}) => {
  expect(
    await page
      .locator('[data-opt-owned="ui"]')
      .evaluate((host) => host.shadowRoot),
  ).toBeNull();
  const text = await page.evaluate(
    () => (window as unknown as Harness).__root.textContent,
  );
  expect(text).not.toContain("test-only-not-real");
  await page.setViewportSize({ width: 375, height: 800 });
  const width = await page.evaluate(
    () =>
      (window as unknown as Harness).__root
        .querySelector<HTMLElement>(".panel")!
        .getBoundingClientRect().width,
  );
  expect(width).toBeLessThanOrEqual(351);
});
async function selectArticle(page: Page): Promise<void> {
  await page.evaluate(() => {
    const paragraph = document.querySelector("#article")!;
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    const selected = window.getSelection()!;
    selected.removeAllRanges();
    selected.addRange(range);
    paragraph.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, clientX: 180, clientY: 250 }),
    );
  });
}
test("selection remains visible after applying changed settings and supports copy", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as unknown as Harness).__root.querySelector<HTMLSelectElement>(
      "#target",
    )!.value = "ja";
  });
  await selectArticle(page);
  await clickControl(page, '[data-action="selection"]');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as Harness).__root.querySelector(".result")!
            .textContent,
      ),
    )
    .toContain("日文译文");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as Harness).__root.querySelector<HTMLElement>(
          ".selection",
        )!.hidden,
    ),
  ).toBe(false);
  await clickControl(page, '[data-action="selection-copy"]');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Harness).__clipboard))
    .toContain("日文译文");
});
test("clearing credentials cancels pending selection requests", async ({
  page,
}) => {
  await page.evaluate(() => {
    (window as unknown as Harness).__delay = 700;
  });
  await selectArticle(page);
  await clickControl(page, '[data-action="selection"]');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Harness).__calls))
    .toBe(1);
  await page.evaluate(() =>
    (window as unknown as Harness).__menus["清除当前引擎密钥"]!(),
  );
  expect(
    await page.evaluate(() => (window as unknown as Harness).__aborts),
  ).toBe(1);
  await page.waitForTimeout(900);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as Harness).__root.querySelector<HTMLElement>(
          ".selection",
        )!.hidden,
    ),
  ).toBe(true);
});
test("blank Youdao app ID stops all work instead of reusing cleared credentials", async ({
  page,
}) => {
  await page.evaluate(() => {
    const w = window as unknown as Harness;
    w.__delay = 700;
    const engine = w.__root.querySelector<HTMLSelectElement>("#engine")!;
    engine.value = "youdao";
    engine.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await clickControl(page, '[data-action="start"]');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Harness).__calls))
    .toBeGreaterThan(0);
  page.once("dialog", (dialog) => dialog.accept(""));
  await page.evaluate(() =>
    (window as unknown as Harness).__menus["设置当前引擎密钥"]!(),
  );
  const count = await page.evaluate(
    () => (window as unknown as Harness).__calls,
  );
  expect(
    await page.evaluate(() => (window as unknown as Harness).__aborts),
  ).toBeGreaterThan(0);
  await page.waitForTimeout(900);
  expect(
    await page.evaluate(() => (window as unknown as Harness).__calls),
  ).toBe(count);
  await expect(page.locator("[data-opt-translation]")).toHaveCount(0);
});
test("shortcut does not start translation while editing settings", async ({
  page,
}) => {
  await page.evaluate(() => {
    const root = (window as unknown as Harness).__root;
    root.querySelector<HTMLDetailsElement>("details")!.open = true;
    root.querySelector<HTMLInputElement>("#endpoint")!.focus();
  });
  await page.keyboard.press("Alt+t");
  expect(
    await page.evaluate(() => (window as unknown as Harness).__calls),
  ).toBe(0);
});
test("demo screenshot", async ({ page }, testInfo) => {
  await clickControl(page, '[data-action="start"]');
  await expect(page.locator("#article [data-opt-translation]")).toContainText(
    "中文译文",
  );
  if (testInfo.project.name === "chromium")
    await page.screenshot({ path: "docs/screenshot.png" });
});
