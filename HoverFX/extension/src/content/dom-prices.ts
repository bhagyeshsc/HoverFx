import { extractPrices, type PriceMatch, type CurrencyContext } from '../shared/currency';

export interface HoverPrice {
  price: PriceMatch;
  bounds: DOMRect;
}

const REJECTED_TAGS = 'script,style,textarea,input,select,option,button,code,pre,kbd,samp,svg,canvas,[contenteditable=""],[contenteditable="true"],[role="textbox"],[aria-hidden="true"]';

function isInExcludedElement(element: Element): boolean {
  return Boolean(element.closest(REJECTED_TAGS) || element.closest('#hoverfx-overlay-host'));
}

interface TextSpan {
  node: Text;
  start: number;
  end: number;
}

function scanContainer(element: Element): { text: string; spans: TextSpan[] } | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return parent && !isInExcludedElement(parent) && node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const spans: TextSpan[] = [];
  let text = '';
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const value = node.textContent ?? '';
    // Never collect a large page subsection or scan excessive descendants.
    if (spans.length >= 28 || text.length + value.length > 240) return null;
    spans.push({ node, start: text.length, end: text.length + value.length });
    text += value;
  }
  return spans.length ? { text, spans } : null;
}

function asRange(match: PriceMatch, spans: TextSpan[]): Range | null {
  const first = spans.find((s) => s.end > match.start);
  const last = spans.find((s) => s.end >= match.end && s.start < match.end);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, match.start - first.start);
  range.setEnd(last.node, match.end - last.start);
  return range;
}

function near(pointX: number, pointY: number, rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0 && pointX >= rect.left - 3 && pointX <= rect.right + 3 &&
    pointY >= rect.top - 3 && pointY <= rect.bottom + 3;
}

export function findPriceAtPoint(x: number, y: number, ctx: CurrencyContext): HoverPrice | null {
  const element = document.elementFromPoint(x, y);
  if (!element || isInExcludedElement(element)) return null;
  let current: Element | null = element;
  for (let depth = 0; depth < 5 && current; depth++, current = current.parentElement) {
    if (isInExcludedElement(current)) return null;
    const scan = scanContainer(current);
    if (!scan) continue;
    const matches = extractPrices(scan.text, ctx);
    for (const match of matches) {
      const range = asRange(match, scan.spans);
      if (!range) continue;
      try {
        const rectangles = Array.from(range.getClientRects());
        const hit = rectangles.find((rect) => near(x, y, rect));
        if (hit) return { price: match, bounds: hit };
      } finally {
        range.detach();
      }
    }
  }
  return null;
}

export function readPageCurrency(): string | null {
  const selectors = [
    'meta[property="product:price:currency"]',
    'meta[property="og:price:currency"]',
    'meta[itemprop="priceCurrency"]',
    'meta[name="currency"]',
  ];
  for (const selector of selectors) {
    const value = document.querySelector<HTMLMetaElement>(selector)?.content?.toUpperCase().trim();
    if (value && /^[A-Z]{3}$/.test(value)) return value;
  }
  return null;
}
