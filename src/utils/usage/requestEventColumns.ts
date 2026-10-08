export const REQUEST_EVENT_COLUMNS = [
  { id: 'time', label: 'request_events_timestamp', width: 180 },
  { id: 'model', label: 'model_name', width: 280 },
  { id: 'speed', label: 'request_events_speed', width: 125 },
  { id: 'performance', label: 'request_events_performance', width: 145 },
  { id: 'turnState', label: 'request_events_turn_state_length', width: 145 },
  { id: 'clientIP', label: 'request_events_client_ip', width: 135 },
  { id: 'apiKey', label: 'request_events_api_key', width: 190 },
  { id: 'sourceType', label: 'request_events_source_type', width: 100 },
  { id: 'source', label: 'request_events_source_account', width: 190 },
  { id: 'proxy', label: 'request_events_proxy', width: 175 },
  { id: 'authIndex', label: 'request_events_auth_index', width: 135 },
  { id: 'result', label: 'request_events_result', width: 85 },
  { id: 'capture', label: 'capture_column', width: 65 },
  { id: 'input', label: 'input_tokens', width: 110 },
  { id: 'output', label: 'output_tokens', width: 110 },
  { id: 'reasoning', label: 'reasoning_tokens', width: 110 },
  { id: 'cached', label: 'cached_tokens', width: 110 },
  { id: 'total', label: 'total_tokens', width: 110 },
] as const;

export type RequestEventColumnId = (typeof REQUEST_EVENT_COLUMNS)[number]['id'];

export function normalizeHiddenEventColumns(value: unknown): RequestEventColumnId[] {
  if (!Array.isArray(value)) return [];
  const hidden = REQUEST_EVENT_COLUMNS.filter((column) => value.includes(column.id)).map(
    (column) => column.id
  );
  return hidden.length === REQUEST_EVENT_COLUMNS.length ? [] : hidden;
}
