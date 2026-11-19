import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const popup = readFileSync(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8');
const popupLogic = readFileSync(new URL('../entrypoints/popup/main.ts', import.meta.url), 'utf8');
const popupCSS = readFileSync(new URL('../entrypoints/popup/style.css', import.meta.url), 'utf8');
const tooltip = readFileSync(new URL('../entrypoints/content.ts', import.meta.url), 'utf8');

test('minimal default popup retains primary controls', () => {
  for (const id of ['enabled','target','target-code','target-name','site-name','site-state','site-toggle']) {
    assert.match(popup, new RegExp(`id="${id}"`));
  }
  assert.match(popup, /<label[^>]*for="target"/);
  assert.match(popupLogic, /settings\.targetCurrency = target\.value/);
  assert.match(popupLogic, /settings\.enabled = enabled\.checked/);
});

test('advanced settings use native disclosure, preserving both exclusion paths and source override', () => {
  assert.match(popup, /<details class="details"/);
  for (const id of ['site-source','add-site','domain-input','excluded-list','site-count']) {
    assert.match(popup, new RegExp(`id="${id}"`));
  }
  assert.match(popupLogic, /siteOverride\(currentDomain, settings\.sourceOverrides\)/);
  assert.match(popupLogic, /settings\.excludedSites\.push\(domain\)/);
  assert.match(popupCSS, /:focus-visible/);
});

test('compact hover tooltip has exactly a currency pair and converted value', () => {
  assert.match(tooltip, /panel\.append\(pairEl, amountEl\)/);
  assert.match(tooltip, /\$\{from\} → \$\{settings\.targetCurrency\}/);
  assert.match(tooltip, /formatConverted\(hit\.price\.amount \* reply\.rate, settings\.targetCurrency\)/);
  assert.doesNotMatch(tooltip, /tooltipNode\([^\n]*['\"](?:source|fine|dismiss|assumed)['\"]/);
  assert.doesNotMatch(tooltip, /Source assumed as|Looking up reference rate|Original ·|formatDate\(reply\.date\)/);
  assert.match(tooltip, /Rate unavailable/);
  assert.match(tooltip, /pointer-events: none/);
  assert.match(tooltip, /prefers-reduced-motion/);
});
