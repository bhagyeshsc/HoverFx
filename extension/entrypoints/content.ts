import { browser } from 'wxt/browser';
import { defineContentScript } from '#imports';
import { findPriceAtPoint, readPageCurrency, type HoverPrice } from '../src/content/dom-prices';
import { formatConverted } from '../src/shared/currency';
import { loadSettings, siteIsExcluded, siteOverride, SETTINGS_KEY, sanitizeSettings, type Settings } from '../src/shared/settings';
import type { RateReply } from '../src/shared/messages';

const HOVER_DELAY = 310;
const HIDE_DELAY = 240;

const TOOLTIP_STYLES = `
:host { all: initial; position: fixed; z-index: 2147483647; pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif; }
* { box-sizing: border-box; }
.panel { pointer-events: none; width: max-content; min-width: 128px;
  max-width: calc(100vw - 16px); padding: 10px 13px 11px;
  background: #fff; border: 1px solid #e0e6e1; border-radius: 9px;
  box-shadow: 0 8px 24px rgba(18,30,21,.12), 0 1px 3px rgba(18,30,21,.04);
  color: #202922; -webkit-font-smoothing: antialiased;
  animation: hoverfx-enter .13s ease-out; }
.pair { color: #647268; font-size: 11px; font-weight: 610; letter-spacing: .015em;
  line-height: 1.4; }
.amount { margin-top: 2px; font-size: 23px; font-weight: 670; letter-spacing: -.04em;
  line-height: 1.2; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.amount.error { color: #a63e36; font-size: 12px; font-weight: 590; letter-spacing: 0; }
@keyframes hoverfx-enter { from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .panel { animation: none; } }
`;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  async main() {
    if (!document.documentElement) return;
    const hostname = location.hostname.toLowerCase();
    if (!hostname) return;

    let settings: Settings = await loadSettings();
    const canRun = () => settings.enabled && !siteIsExcluded(hostname, settings.excludedSites);
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let hovered: HoverPrice | null = null;
    let shownKey = '';
    let requestId = 0;
    let host: HTMLDivElement | null = null;
    let panel: HTMLDivElement | null = null;
    let amountEl: HTMLDivElement | null = null;
    let pairEl: HTMLSpanElement | null = null;

    function cancelHover() {
      clearTimeout(hoverTimer);
      hoverTimer = undefined;
    }
    function cancelHide() {
      clearTimeout(hideTimer);
      hideTimer = undefined;
    }
    function hideImmediately() {
      cancelHover();
      cancelHide();
      requestId++;
      host?.remove();
      host = null; panel = null; amountEl = null; pairEl = null;
      hovered = null; shownKey = '';
    }
    function queueHide() {
      if (!host) return;
      cancelHide();
      hideTimer = setTimeout(hideImmediately, HIDE_DELAY);
    }
    function placeTooltip(hit: HoverPrice) {
      if (!host || !panel) return;
      const { bounds } = hit;
      const width = panel.offsetWidth || 160;
      const height = panel.offsetHeight || 70;
      const left = Math.max(8, Math.min(window.innerWidth - width - 8, bounds.left));
      const below = bounds.bottom + 12;
      const top = below + height < window.innerHeight - 8
        ? below : Math.max(8, bounds.top - height - 12);
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
    }
    function tooltipNode(tag: string, className: string, content = ''): HTMLElement {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = content;
      return element;
    }
    function buildTooltip(hit: HoverPrice): void {
      host?.remove();
      host = document.createElement('div');
      host.id = 'hoverfx-overlay-host';
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = TOOLTIP_STYLES;
      shadow.append(style);
      panel = tooltipNode('div', 'panel') as HTMLDivElement;
      pairEl = tooltipNode('span', 'pair', `${hit.price.currency} → ${settings.targetCurrency}`) as HTMLSpanElement;
      amountEl = tooltipNode('div', 'amount', '…') as HTMLDivElement;
      amountEl.setAttribute('role', 'status');
      amountEl.setAttribute('aria-live', 'polite');
      panel.append(pairEl, amountEl);
      shadow.append(panel);
      document.documentElement.append(host);
      placeTooltip(hit);
    }
    async function displayRate(hit: HoverPrice, from: string) {
      const current = ++requestId;
      if (!amountEl || !pairEl) return;
      pairEl.textContent = `${from} → ${settings.targetCurrency}`;
      amountEl.textContent = '…';
      amountEl.classList.remove('error');
      if (from === settings.targetCurrency) {
        amountEl.textContent = formatConverted(hit.price.amount, from);
        placeTooltip(hit);
        return;
      }
      try {
        const reply = await browser.runtime.sendMessage({ type: 'HOVERFX_GET_RATE', from, to: settings.targetCurrency }) as RateReply;
        if (current !== requestId || !amountEl) return;
        if (!reply?.ok) throw new Error(reply?.error || 'Rate unavailable');
        amountEl.textContent = formatConverted(hit.price.amount * reply.rate, settings.targetCurrency);
        placeTooltip(hit);
      } catch {
        if (current !== requestId || !amountEl) return;
        amountEl.textContent = 'Rate unavailable';
        amountEl.classList.add('error');
        placeTooltip(hit);
      }
    }
    function show(hit: HoverPrice) {
      if (!canRun()) return;
      hovered = hit;
      shownKey = `${hit.price.text}:${hit.bounds.left}:${hit.bounds.top}`;
      buildTooltip(hit);
      void displayRate(hit, hit.price.currency);
    }
    function pointerMove(event: PointerEvent) {
      if (!canRun() || event.pointerType === 'touch') return;
      const ctx = {
        hostname,
        language: document.documentElement.lang || navigator.language,
        pageCurrency: readPageCurrency(),
        overrideCurrency: siteOverride(hostname, settings.sourceOverrides),
      };
      const hit = findPriceAtPoint(event.clientX, event.clientY, ctx);
      if (!hit) {
        cancelHover();
        if (host) queueHide();
        return;
      }
      cancelHide();
      const key = `${hit.price.text}:${hit.bounds.left}:${hit.bounds.top}`;
      if (host && key === shownKey) return;
      if (hovered && key === `${hovered.price.text}:${hovered.bounds.left}:${hovered.bounds.top}` && hoverTimer) return;
      cancelHover();
      if (host) hideImmediately();
      hovered = hit;
      hoverTimer = setTimeout(() => {
        hoverTimer = undefined;
        show(hit);
      }, HOVER_DELAY);
    }

    document.addEventListener('pointermove', pointerMove, { passive: true });
    document.addEventListener('pointerdown', hideImmediately, { passive: true });
    document.addEventListener('scroll', hideImmediately, { passive: true, capture: true });
    window.addEventListener('blur', hideImmediately);
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[SETTINGS_KEY]) return;
      const previous = settings;
      settings = sanitizeSettings(changes[SETTINGS_KEY].newValue);
      if (previous.enabled !== settings.enabled || previous.targetCurrency !== settings.targetCurrency ||
          siteIsExcluded(hostname, previous.excludedSites) !== siteIsExcluded(hostname, settings.excludedSites)) {
        hideImmediately();
      }
    });
  },
});
