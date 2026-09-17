export type RequestHeaderRule = {
  name: string;
  operation: 'default' | 'override' | 'delete';
  value?: string;
};

const protectedNames = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'cookie',
  'set-cookie',
  'host',
  'connection',
  'upgrade',
  'content-length',
  'transfer-encoding',
  'te',
  'trailer',
  'keep-alive',
  'expect',
  'content-type',
  'content-encoding',
  'accept-encoding',
  'accept',
  'openai-beta',
  'chatgpt-account-id',
  'openai-organization',
  'openai-project',
  'session-id',
  'session_id',
  'conversation-id',
  'conversation_id',
  'thread-id',
  'thread_id',
  'x-codex-window-id',
  'x-codex-device-id',
  'x-codex-installation-id',
  'oai-device-id',
  'x-device-id',
  'x-codex-routing-hint',
  'x-codex-turn-state',
  'x-codex-turn-metadata',
  'x-client-request-id',
]);

export function parseRequestHeaderRules(value: unknown): RequestHeaderRule[] {
  if (value == null) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (rule) =>
        !rule ||
        typeof rule !== 'object' ||
        typeof rule.name !== 'string' ||
        !['default', 'override', 'delete'].includes(rule.operation) ||
        (rule.value !== undefined && typeof rule.value !== 'string')
    )
  )
    throw new Error('Invalid request_header_rules');
  return value.map((rule) => ({ ...rule }));
}

export function validateRequestHeaderRules(rules: RequestHeaderRule[]) {
  if (rules.length > 32) return { key: 'limit', row: 0 };
  const seen = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    const row = index + 1;
    const name = rule.name.toLowerCase();
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(rule.name) || rule.name.length > 128)
      return { key: 'invalid_name', row };
    if (protectedNames.has(name) || name.startsWith('sec-websocket-') || name.startsWith('proxy-'))
      return { key: 'protected', row };
    if (seen.has(name)) return { key: 'duplicate', row };
    seen.add(name);
    if (
      rule.operation !== 'delete' &&
      (new TextEncoder().encode(rule.value ?? '').length > 8192 ||
        Array.from(rule.value ?? '').some((char) => {
          const code = char.charCodeAt(0);
          return (code < 32 && code !== 9) || code === 127;
        }))
    )
      return { key: 'invalid_value', row };
  }
  return null;
}
