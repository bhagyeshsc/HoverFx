import { browser } from 'wxt/browser';
import { loadSettings, saveSettings, normalizeDomain, siteIsExcluded, siteOverride, POPULAR_CURRENCIES, type Settings } from '../../src/shared/settings';

const $ = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

async function main(): Promise<void> {
  const enabled = $<HTMLInputElement>('#enabled');
  const powerLabel = $<HTMLLabelElement>('.power-label');
  const target = $<HTMLSelectElement>('#target');
  const targetCode = $<HTMLElement>('#target-code');
  const targetName = $<HTMLElement>('#target-name');
  const siteName = $<HTMLParagraphElement>('#site-name');
  const siteState = $<HTMLSpanElement>('#site-state');
  const siteToggle = $<HTMLButtonElement>('#site-toggle');
  const siteSource = $<HTMLSelectElement>('#site-source');
  const form = $<HTMLFormElement>('#add-site');
  const domainInput = $<HTMLInputElement>('#domain-input');
  const formError = $<HTMLParagraphElement>('#form-error');
  const excludedList = $<HTMLUListElement>('#excluded-list');
  const excludedCount = $<HTMLSpanElement>('#site-count');
  const emptyExclusions = $<HTMLParagraphElement>('#empty-exclusions');

  let settings = await loadSettings();
  let currentDomain: string | null = null;
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && /^https?:\/\//.test(tab.url)) currentDomain = normalizeDomain(new URL(tab.url).hostname);
  } catch { /* Pages such as browser settings have no accessible URL. */ }

  function addOptions(select: HTMLSelectElement): void {
    for (const code of POPULAR_CURRENCIES) {
      const option = document.createElement('option');
      option.value = code;
      const display = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code);
      option.textContent = `${code} · ${display || code}`;
      select.add(option);
    }
  }
  addOptions(target);
  addOptions(siteSource);

  function render(): void {
    enabled.checked = settings.enabled;
    powerLabel.textContent = settings.enabled ? 'On' : 'Off';
    target.value = settings.targetCurrency;
    targetCode.textContent = settings.targetCurrency;
    targetName.textContent = new Intl.DisplayNames(['en'], {type: 'currency'}).of(settings.targetCurrency) || settings.targetCurrency;
    siteToggle.disabled = !currentDomain;
    siteSource.disabled = !currentDomain;
    siteName.textContent = currentDomain || 'Unavailable on this browser page';
    const excluded = currentDomain ? siteIsExcluded(currentDomain, settings.excludedSites) : false;
    siteState.querySelector('.state-text')!.textContent = !settings.enabled ? 'Paused' : excluded ? 'Excluded' : currentDomain ? 'Active' : 'Unavailable';
    siteState.classList.toggle('off', !settings.enabled || excluded || !currentDomain);
    siteToggle.textContent = excluded ? 'Enable on this site' : 'Exclude this site';
    siteSource.value = currentDomain ? siteOverride(currentDomain, settings.sourceOverrides) || '' : '';
    excludedCount.textContent = `${settings.excludedSites.length} excluded`;
    excludedList.replaceChildren();
    for (const site of settings.excludedSites) {
      const item = document.createElement('li');
      const text = document.createElement('span');
      text.textContent = site;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove exclusion for ${site}`);
      remove.addEventListener('click', () => {
        settings.excludedSites = settings.excludedSites.filter((domain) => domain !== site);
        void persist();
      });
      item.append(text, remove);
      excludedList.append(item);
    }
    emptyExclusions.hidden = settings.excludedSites.length !== 0;
  }
  async function persist(): Promise<void> {
    render();
    try { await saveSettings(settings); }
    catch { formError.textContent = 'Could not save settings. Please try again.'; }
  }

  enabled.addEventListener('change', () => { settings.enabled = enabled.checked; void persist(); });
  target.addEventListener('change', () => { settings.targetCurrency = target.value; void persist(); });
  siteToggle.addEventListener('click', () => {
    if (!currentDomain) return;
    const isExcluded = siteIsExcluded(currentDomain, settings.excludedSites);
    settings.excludedSites = isExcluded
      ? settings.excludedSites.filter((site) => !(currentDomain === site || currentDomain.endsWith(`.${site}`)))
      : [...new Set([...settings.excludedSites, currentDomain])];
    void persist();
  });
  siteSource.addEventListener('change', () => {
    if (!currentDomain) return;
    if (!siteSource.value) delete settings.sourceOverrides[currentDomain];
    else settings.sourceOverrides[currentDomain] = siteSource.value;
    void persist();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    formError.textContent = '';
    const domain = normalizeDomain(domainInput.value);
    if (!domain) { formError.textContent = 'Enter a valid domain, for example example.com'; return; }
    if (!settings.excludedSites.includes(domain)) settings.excludedSites.push(domain);
    domainInput.value = '';
    void persist();
  });
  render();
}

void main().catch((error: unknown) => {
  console.error('[HoverFX] Popup failed to initialize', error);
  document.body.textContent = 'Could not load HoverFX settings. Try reopening the popup.';
});
