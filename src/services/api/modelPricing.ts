import { apiCallApi } from './apiCall';
import { parseRemoteModelPrices } from '@/utils/usage/modelPricing';

export const MODEL_PRICING_SOURCE =
  'https://raw.githubusercontent.com/Wei-Shaw/model-price-repo/main/model_prices_and_context_window.json';

export async function fetchModelPrices() {
  const result = await apiCallApi.request({
    method: 'GET',
    url: MODEL_PRICING_SOURCE,
    header: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw new Error(`HTTP ${result.statusCode}`);
  }
  return parseRemoteModelPrices(result.body);
}
