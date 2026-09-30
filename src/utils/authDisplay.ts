type NamedAuth = { name: string; note?: unknown };

export const authDisplayName = (auth: NamedAuth): string =>
  (typeof auth.note === 'string' ? auth.note.trim() : '') || auth.name;

export const authOptionLabel = (auth: NamedAuth): string => {
  const display = authDisplayName(auth);
  if (display === auth.name) return auth.name;
  const shortName =
    auth.name.length > 32 ? `${auth.name.slice(0, 20)}...${auth.name.slice(-8)}` : auth.name;
  return `${display} · ${shortName}`;
};
