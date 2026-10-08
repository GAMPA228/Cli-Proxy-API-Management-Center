import type { ModelPrice } from '@/utils/usage';

export function parseRemoteModelPrices(payload: unknown): Record<string, ModelPrice> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid model pricing data');
  }
  const prices: Record<string, ModelPrice> = Object.create(null);
  for (const [model, entry] of Object.entries(payload)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const values = entry as Record<string, unknown>;
    const rates = [
      values.input_cost_per_token,
      values.output_cost_per_token,
      values.cache_read_input_token_cost,
    ];
    if (
      !rates.every(
        (rate) =>
          typeof rate === 'number' &&
          Number.isFinite(rate) &&
          rate >= 0 &&
          Number.isFinite(rate * 1_000_000)
      )
    )
      continue;
    const [prompt, completion, cache] = rates as number[];
    prices[model] = {
      prompt: prompt * 1_000_000,
      completion: completion * 1_000_000,
      cache: cache * 1_000_000,
    };
  }
  if (!Object.keys(prices).length) throw new Error('No valid token prices in response');
  return prices;
}

export function mergeRemoteModelPrices(
  current: Record<string, ModelPrice>,
  modelNames: string[],
  remote: Record<string, ModelPrice>
) {
  const prices = { ...current };
  let updated = 0;
  let added = 0;
  const unmatched: string[] = [];
  for (const model of new Set([...Object.keys(current), ...modelNames])) {
    if (!Object.prototype.hasOwnProperty.call(remote, model)) {
      unmatched.push(model);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(current, model)) updated++;
    else added++;
    Object.defineProperty(prices, model, {
      value: { ...remote[model] },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return { prices, updated, added, unmatched: unmatched.sort() };
}
