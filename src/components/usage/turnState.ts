export type TurnStateInfo = {
  base64Length: number;
  byteLength: number;
  version: number;
  unixSeconds: string;
  issuedAt: Date | null;
  validStructure: boolean;
};

export function parseTurnState(value: string): TurnStateInfo {
  const token = value.trim();
  if (!token || !/^[A-Za-z0-9_-]+={0,2}$/.test(token) || token.length % 4 === 1) {
    throw new Error('invalid_base64');
  }
  let binary: string;
  try {
    binary = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw new Error('invalid_base64');
  }
  if (binary.length < 9) throw new Error('short_header');

  let seconds = 0n;
  for (let i = 1; i <= 8; i++) {
    seconds = (seconds << 8n) | BigInt(binary.charCodeAt(i));
  }
  const milliseconds = seconds * 1000n;
  const issuedAt = milliseconds <= 8640000000000000n ? new Date(Number(milliseconds)) : null;
  const ciphertextLength = binary.length - 1 - 8 - 16 - 32;

  return {
    base64Length: token.length,
    byteLength: binary.length,
    version: binary.charCodeAt(0),
    unixSeconds: seconds.toString(),
    issuedAt,
    validStructure: binary.charCodeAt(0) === 0x80 && ciphertextLength >= 16 && ciphertextLength % 16 === 0,
  };
}
