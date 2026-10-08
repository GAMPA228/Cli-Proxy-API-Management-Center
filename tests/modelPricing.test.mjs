import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/utils/usage/modelPricing.ts', import.meta.url),
  'utf8'
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { parseRemoteModelPrices, mergeRemoteModelPrices } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
const entry = {
  input_cost_per_token: 0.000002,
  output_cost_per_token: 0.000008,
  cache_read_input_token_cost: 0.0000005,
};

test('converts token rates to USD/M and preserves legitimate zero prices', () => {
  assert.deepEqual(parseRemoteModelPrices({ model: entry }).model, {
    prompt: 2,
    completion: 8,
    cache: 0.5,
  });
  assert.deepEqual(
    parseRemoteModelPrices({
      zero: { input_cost_per_token: 0, output_cost_per_token: 0, cache_read_input_token_cost: 0 },
    }).zero,
    { prompt: 0, completion: 0, cache: 0 }
  );
});

test('rejects invalid payloads and ignores incomplete, negative, string, or overflowing rates', () => {
  for (const payload of [
    null,
    [],
    'html',
    {},
    { model: { ...entry, cache_read_input_token_cost: null } },
  ]) {
    assert.throws(() => parseRemoteModelPrices(payload));
  }
  for (const invalid of [undefined, null, -1, '0.01', NaN, Infinity, Number.MAX_VALUE]) {
    const remote = parseRemoteModelPrices({
      good: entry,
      invalid: { ...entry, input_cost_per_token: invalid },
    });
    assert.deepEqual(Object.keys(remote), ['good']);
  }
});

test('overwrites saved prices, adds usage models once, and retains unmatched prices', () => {
  const old = { prompt: 90, completion: 90, cache: 90 };
  const current = { model: old, private: old };
  const remote = parseRemoteModelPrices({ model: entry, new: entry, unrelated: entry });
  const result = mergeRemoteModelPrices(current, ['model', 'new', 'new', 'missing'], remote);
  assert.equal(result.updated, 1);
  assert.equal(result.added, 1);
  assert.deepEqual(result.unmatched, ['missing', 'private']);
  assert.deepEqual(result.prices.model, { prompt: 2, completion: 8, cache: 0.5 });
  assert.deepEqual(result.prices.private, old);
  assert.ok(!Object.hasOwn(result.prices, 'unrelated'));
  assert.deepEqual(current.model, old);
  result.prices.model.prompt = 99;
  assert.equal(mergeRemoteModelPrices(result.prices, [], remote).prices.model.prompt, 2);
  assert.equal(remote.model.prompt, 2);
});

test('matches exact model names only and ignores inherited properties', () => {
  const result = mergeRemoteModelPrices(
    {},
    ['openai/model', 'model', 'toString', '__proto__'],
    parseRemoteModelPrices({ model: entry })
  );
  assert.deepEqual(result.unmatched, ['__proto__', 'openai/model', 'toString']);
  assert.equal(result.added, 1);
});
