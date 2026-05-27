const CODEX_KEY = "pixel-survivor-codex";
const EMPTY_CODEX = { enemies: [], weapons: [], items: [] };
const VALID_TYPES = new Set(Object.keys(EMPTY_CODEX));

function readCodex() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CODEX_KEY) || "{}");
    return normalizeCodex(parsed);
  } catch {
    localStorage.removeItem(CODEX_KEY);
    return { ...EMPTY_CODEX };
  }
}

function writeCodex(codex) {
  localStorage.setItem(CODEX_KEY, JSON.stringify(normalizeCodex(codex)));
}

function normalizeCodex(codex) {
  return {
    enemies: uniqueList(codex?.enemies),
    weapons: uniqueList(codex?.weapons),
    items: uniqueList(codex?.items),
  };
}

function uniqueList(value) {
  return Array.from(new Set(Array.isArray(value) ? value.filter(Boolean) : []));
}

export function recordCodexEntry(type, id) {
  if (!VALID_TYPES.has(type) || !id) return false;
  const codex = readCodex();
  if (codex[type].includes(id)) return false;
  codex[type].push(id);
  writeCodex(codex);
  return true;
}

export function getCodexEntries(type) {
  if (!VALID_TYPES.has(type)) return [];
  return readCodex()[type];
}

export function isCodexUnlocked(type, id) {
  return getCodexEntries(type).includes(id);
}
