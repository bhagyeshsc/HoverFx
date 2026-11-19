import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPrices, parsePriceNumber, resolveCurrency } from '../src/shared/currency.ts';
const ctx = { hostname: 'store.example.com', language: 'en-US' };

for (const [number, expected] of [
  ['129.00', 129], ['1,299.50', 1299.5], ['1.299,50', 1299.5],
  ["1'299.00", 1299], ['1 299,50', 1299.5], ['1,299', 1299],
  ['1.234.567', 1234567], ['0,50', 0.5], ['12.00', 12],
]) {
  test(`parses ${number}`, () => assert.equal(parsePriceNumber(number), expected));
}
for (const [text, currency, amount] of [
  ['$129.00', 'USD', 129], ['₹ 1,299', 'INR', 1299],
  ['€1.299,50', 'EUR', 1299.5], ['1.299,50 €', 'EUR', 1299.5],
  ['GBP 1,299.90', 'GBP', 1299.9], ['129 USD', 'USD', 129],
  ['A$10.00', 'AUD', 10], ['CA$25', 'CAD', 25],
  ['¥2,000', 'JPY', 2000], ['R$ 3.450,25', 'BRL', 3450.25],
  ['₩15,000', 'KRW', 15000], ['Rs. 899', 'INR', 899],
]) {
  test(`detects ${text}`, () => {
    const matches = extractPrices(`Price: ${text} today`, ctx);
    assert.equal(matches[0]?.currency, currency);
    assert.equal(matches[0]?.amount, amount);
    assert.equal(matches[0]?.text, text);
  });
}
test('multiple prices in one string', () => {
  const matches = extractPrices('Was $19.99, now $15.00', ctx);
  assert.deepEqual(matches.map((m) => m.amount), [19.99, 15]);
});
test('dollar symbol uses Canadian site context', () => {
  assert.deepEqual(resolveCurrency('$', { hostname: 'store.ca' }), { code: 'CAD', assumed: true });
});
test('kr without a known region is rejected', () => {
  assert.equal(resolveCurrency('kr', { hostname: 'something.com' }), null);
});
test('do not match unrelated digits or words', () => {
  assert.equal(extractPrices('Order 1200, expires 2026-12-10', ctx).length, 0);
});
