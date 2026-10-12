import type { TextBlock } from "../types";

const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,div";
const EXCLUDED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "CODE",
  "PRE",
  "FORM",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "OPTION",
  "BUTTON",
  "SVG",
  "MATH",
]);
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const TRANSLATION_SELECTOR =
  '[data-opt-owned="translation"][data-opt-translation]';
const blockIds = new WeakMap<HTMLElement, string>();
const containers = new WeakMap<HTMLElement, HTMLElement>();
let nextBlockId = 0;

function isHtmlElement(node: Node): node is HTMLElement {
  return (
    node.nodeType === 1 && (node as Element).namespaceURI === HTML_NAMESPACE
  );
}

function isExcludedHere(element: Element): boolean {
  if (
    EXCLUDED_TAGS.has(element.tagName.toUpperCase()) ||
    element.hasAttribute("data-opt-owned") ||
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden")?.toLowerCase() === "true" ||
    element.getAttribute("translate")?.toLowerCase() === "no" ||
    element.classList.contains("notranslate")
  ) {
    return true;
  }

  const editable = element.getAttribute("contenteditable");
  if (editable !== null && editable.toLowerCase() !== "false") return true;

  // Geometry checks would also reject off-screen content and fixed elements.
  const styles = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    styles?.display === "none" ||
    styles?.visibility === "hidden" ||
    styles?.visibility === "collapse" ||
    styles?.contentVisibility === "hidden"
  );
}

function isExcluded(
  element: Element,
  cache = new WeakMap<Element, boolean>(),
): boolean {
  const cached = cache.get(element);
  if (cached !== undefined) return cached;
  const excluded =
    isExcludedHere(element) ||
    (element.parentElement !== null &&
      isExcluded(element.parentElement, cache));
  cache.set(element, excluded);
  return excluded;
}

function readText(
  element: HTMLElement,
  cache: WeakMap<Element, boolean>,
): string {
  if (isExcluded(element, cache)) return "";
  const fragments: string[] = [];
  const visit = (node: Node): void => {
    if (node.nodeType === 3) {
      fragments.push(node.nodeValue ?? "");
      return;
    }
    if (!isHtmlElement(node) || isExcluded(node, cache)) return;
    // Each descendant block is translated on its own; inline links and emphasis
    // belong to the surrounding block and are read without modifying their DOM.
    if (node !== element && node.matches(BLOCK_SELECTOR)) {
      fragments.push(" ");
      return;
    }
    if (node.tagName === "BR") fragments.push(" ");
    for (const child of node.childNodes) visit(child);
  };
  visit(element);
  return fragments.join("").replace(/\s+/gu, " ").trim();
}

/** Return only the block's source text, excluding nested blocks and our UI. */
export function getBlockText(element: HTMLElement): string {
  return readText(element, new WeakMap());
}

/** Collect independent text blocks without altering the source page. */
export function collectBlocks(root: ParentNode = document.body): TextBlock[] {
  const candidates: HTMLElement[] = [];
  if (
    isHtmlElement(root as Node) &&
    (root as HTMLElement).matches(BLOCK_SELECTOR)
  ) {
    candidates.push(root as HTMLElement);
  }
  candidates.push(...root.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
  const cache = new WeakMap<Element, boolean>();
  const blocks: TextBlock[] = [];

  for (const element of candidates) {
    const text = readText(element, cache);
    if (!text) continue;
    let id = blockIds.get(element);
    if (!id) {
      id = `opt-block-${++nextBlockId}`;
      blockIds.set(element, id);
    }
    blocks.push({ id, element, text });
  }
  return blocks;
}

function ownedElement<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  tag: K,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.setAttribute("data-opt-owned", "translation");
  return element;
}

function positionContainer(element: HTMLElement, container: HTMLElement): void {
  let lastInline: ChildNode | null = null;
  const cache = new WeakMap<Element, boolean>();
  for (const child of element.childNodes) {
    if (child.nodeType === 3 && child.nodeValue?.trim()) lastInline = child;
    if (!isHtmlElement(child) || child.hasAttribute("data-opt-owned")) continue;
    if (child.matches(BLOCK_SELECTOR)) continue;
    // Preserve the original inline flow, including untranslated code/controls,
    // but keep a parent's translation ahead of its nested list or paragraph.
    if (child.querySelector(BLOCK_SELECTOR) && !readText(child, cache))
      continue;
    lastInline = child;
  }
  const reference = lastInline?.nextSibling ?? null;
  if (reference !== container) element.insertBefore(container, reference);
}

function getContainer(block: TextBlock): HTMLElement {
  const existing = containers.get(block.element);
  if (existing?.parentNode === block.element) {
    positionContainer(block.element, existing);
    return existing;
  }

  // A span is valid inside paragraphs/headings as well as list items and cells;
  // its block display never inserts invalid siblings between li/tr elements.
  const container = ownedElement(block.element.ownerDocument, "span");
  container.setAttribute("data-opt-translation", "");
  container.setAttribute("data-opt-block-id", block.id);
  container.setAttribute("dir", "auto");
  container.style.cssText =
    "display:block;margin-top:0.35em;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:inherit;color:inherit;opacity:0.9;";
  positionContainer(block.element, container);
  containers.set(block.element, container);
  return container;
}

/** Insert a plain-text translation while preserving every original node. */
export function renderTranslation(block: TextBlock, text: string): void {
  const container = getContainer(block);
  container.className = "opt-translation";
  container.removeAttribute("role");
  container.textContent = text;
}

/** Show a retry control inside the same owned translation container. */
export function renderError(
  block: TextBlock,
  message: string,
  retry: () => void,
): void {
  const container = getContainer(block);
  container.className = "opt-translation opt-translation-error";
  container.setAttribute("role", "status");
  const label = ownedElement(block.element.ownerDocument, "span");
  label.textContent = message;
  const button = ownedElement(block.element.ownerDocument, "button");
  button.type = "button";
  button.textContent = "重试";
  button.style.cssText =
    "margin-inline-start:0.5em;padding:0.15em 0.55em;font:inherit;cursor:pointer;";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    retry();
  });
  container.replaceChildren(label, button);
}

/** Remove translations/errors only; leave website content and controls intact. */
export function clearTranslations(root: ParentNode = document.body): void {
  if (
    isHtmlElement(root as Node) &&
    (root as HTMLElement).matches(TRANSLATION_SELECTOR)
  ) {
    (root as HTMLElement).remove();
    return;
  }
  for (const container of root.querySelectorAll(TRANSLATION_SELECTOR))
    container.remove();
}
