// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTranslations,
  collectBlocks,
  getBlockText,
  renderError,
  renderTranslation,
} from "../../src/page";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("page text extraction", () => {
  it("keeps inline text together without replacing links or emphasis", () => {
    document.body.innerHTML =
      '<p>Hello <a href="/next">linked</a> <em>world</em>.</p>';
    const [block] = collectBlocks();
    expect(block?.text).toBe("Hello linked world.");
    expect(block?.element).toBe(document.querySelector("p"));
  });

  it("collects headings, list items and cells without duplicating nested blocks", () => {
    document.body.innerHTML = `
      <div><h2>Heading</h2><p>Paragraph</p></div>
      <blockquote><p>Quote one</p><p>Quote two</p></blockquote>
      <ul><li>Parent item<ul><li>Child item</li></ul></li></ul>
      <table><tbody><tr><th>Label</th><td><p>Cell paragraph</p></td></tr></tbody></table>
    `;
    expect(collectBlocks().map((block) => block.text)).toEqual([
      "Heading",
      "Paragraph",
      "Quote one",
      "Quote two",
      "Parent item",
      "Child item",
      "Label",
      "Cell paragraph",
    ]);
  });

  it("extracts only a div’s direct inline flow while its child paragraphs stay separate", () => {
    document.body.innerHTML =
      "<div>Intro <span>with emphasis</span><p>Child paragraph</p>Tail</div>";
    expect(collectBlocks().map((block) => block.text)).toEqual([
      "Intro with emphasis Tail",
      "Child paragraph",
    ]);
  });

  it("skips forms, code, scripts, editable content and opt-out regions", () => {
    document.body.innerHTML = `
      <form><p>Form text</p></form>
      <div contenteditable><p>Editor text</p></div>
      <div translate="no"><p>Opted out</p></div>
      <div class="notranslate"><p>Also opted out</p></div>
      <div data-opt-owned="ui"><p>Own panel</p></div>
      <svg><foreignObject><p>Embedded graphic text</p></foreignObject></svg>
      <pre>Code block</pre><script>window.secret = 'script text'</script>
      <p>Visible <code>inline code</code> <input value="input"> <button>Action</button></p>
    `;
    expect(collectBlocks().map((block) => block.text)).toEqual(["Visible"]);
  });

  it("skips hidden blocks and hidden inline text, including hidden ancestors", () => {
    document.body.innerHTML = `
      <div hidden><p>Hidden by ancestor</p></div>
      <p style="display:none">Hidden by style</p>
      <p style="visibility:hidden">Invisible</p>
      <p aria-hidden="true">Accessibility hidden</p>
      <p>Public <span hidden>secret</span> words</p>
    `;
    expect(collectBlocks().map((block) => block.text)).toEqual([
      "Public words",
    ]);
  });

  it("recognizes a block root and honors excluded ancestors outside that root", () => {
    document.body.innerHTML = "<div hidden><p>Private</p></div><p>Readable</p>";
    const paragraphs = document.querySelectorAll("p");
    expect(collectBlocks(paragraphs[0]!).length).toBe(0);
    expect(collectBlocks(paragraphs[1]!).map((block) => block.text)).toEqual([
      "Readable",
    ]);
  });

  it("normalizes line breaks and allows explicitly noneditable blocks", () => {
    document.body.innerHTML =
      '<div contenteditable="false"> First<br>second\n line </div>';
    expect(collectBlocks()[0]?.text).toBe("First second line");
  });

  it("keeps a stable ID when source text changes and reflects current source text", () => {
    document.body.innerHTML = "<p>Original</p>";
    const [first] = collectBlocks();
    document.querySelector("p")!.firstChild!.nodeValue = "Updated";
    const [second] = collectBlocks();
    expect(second?.id).toBe(first?.id);
    expect(second?.text).toBe("Updated");
  });
});

describe("non-destructive bilingual rendering", () => {
  it("preserves original nodes and their event listeners when rendering and clearing", () => {
    document.body.innerHTML = '<p>Read <a href="/next">the next page</a>.</p>';
    const link = document.querySelector("a")!;
    const click = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", click);
    const [block] = collectBlocks();
    renderTranslation(block!, "阅读下一页。");
    expect(document.querySelector("a")).toBe(link);
    link.click();
    clearTranslations();
    expect(document.querySelector("a")).toBe(link);
    link.click();
    expect(click).toHaveBeenCalledTimes(2);
    expect(document.querySelector("p")?.textContent).toBe(
      "Read the next page.",
    );
  });

  it("renders service output as text and does not include it in source fingerprints", () => {
    document.body.innerHTML = "<p>Source</p>";
    const [block] = collectBlocks();
    const unsafe = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    renderTranslation(block!, unsafe);
    expect(document.querySelector("img,script")).toBeNull();
    expect(document.querySelector("[data-opt-translation]")?.textContent).toBe(
      unsafe,
    );
    expect(getBlockText(block!.element)).toBe("Source");
    expect(collectBlocks().map((item) => item.text)).toEqual(["Source"]);
  });

  it("updates the existing translation rather than creating duplicates", () => {
    document.body.innerHTML = "<p>Source</p>";
    const [block] = collectBlocks();
    renderTranslation(block!, "First");
    renderTranslation(block!, "Second");
    expect(document.querySelectorAll("[data-opt-translation]")).toHaveLength(1);
    expect(document.querySelector("[data-opt-translation]")?.textContent).toBe(
      "Second",
    );
  });

  it("keeps translation containers inside list items and table cells", () => {
    document.body.innerHTML =
      "<ul><li>List source</li></ul><table><tbody><tr><td>Cell source</td></tr></tbody></table>";
    for (const block of collectBlocks()) renderTranslation(block, "译文");
    expect(document.querySelector("ul")?.children).toHaveLength(1);
    expect(document.querySelector("tr")?.children).toHaveLength(1);
    expect(document.querySelector("li > [data-opt-translation]")?.tagName).toBe(
      "SPAN",
    );
    expect(document.querySelector("td > [data-opt-translation]")?.tagName).toBe(
      "SPAN",
    );
  });

  it("places a parent item’s translation before its nested list", () => {
    document.body.innerHTML = "<ul><li>Parent<ul><li>Child</li></ul></li></ul>";
    for (const block of collectBlocks())
      renderTranslation(block, `${block.text} translation`);
    const parent = document.querySelector("li")!;
    expect(parent.children[0]?.hasAttribute("data-opt-translation")).toBe(true);
    expect(parent.children[1]?.tagName).toBe("UL");
  });

  it("renders a marked retry control and replaces an error with a successful result", () => {
    document.body.innerHTML = "<p>Source</p>";
    const retry = vi.fn();
    const [block] = collectBlocks();
    renderError(block!, "<b>Unavailable</b>", retry);
    const container = document.querySelector("[data-opt-translation]")!;
    expect(container.querySelector("b")).toBeNull();
    expect(
      [...container.querySelectorAll("*")].every((node) =>
        node.hasAttribute("data-opt-owned"),
      ),
    ).toBe(true);
    (container.querySelector("button") as HTMLButtonElement).click();
    expect(retry).toHaveBeenCalledOnce();
    expect(getBlockText(block!.element)).toBe("Source");
    renderTranslation(block!, "恢复译文");
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toBe("恢复译文");
  });

  it("clears translations without removing updated site content or the settings panel", () => {
    document.body.innerHTML =
      '<p>Source</p><aside data-opt-owned="ui">Settings</aside>';
    const [block] = collectBlocks();
    renderTranslation(block!, "译文");
    block!.element.firstChild!.nodeValue = "Updated by site";
    clearTranslations();
    expect(block!.element.textContent).toBe("Updated by site");
    expect(document.querySelector("aside")?.textContent).toBe("Settings");
    expect(document.querySelector("[data-opt-translation]")).toBeNull();
    renderTranslation(collectBlocks()[0]!, "新译文");
    expect(document.querySelectorAll("[data-opt-translation]")).toHaveLength(1);
  });

  it("clears only a requested subtree", () => {
    document.body.innerHTML = "<div><p>First</p></div><p>Second</p>";
    for (const block of collectBlocks()) renderTranslation(block, "译文");
    clearTranslations(document.querySelector("div")!);
    expect(document.querySelectorAll("[data-opt-translation]")).toHaveLength(1);
  });
});
