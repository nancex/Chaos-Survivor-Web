export const AI_STORAGE_ENABLED_KEY = "pixel-survivor-ai-enabled";

export const AI_CONFIG = {
  enabled: false,
  autoStart: true,
  autoRestart: true,
  maxTrainingRuns: 50,
  logLevel: "decision",
  storageKey: "pixel-survivor-ai-training",
  tickHz: 20,
  actionCooldown: 0.28,
  restartDelay: 0.8,
  movement: {
    lookAhead: 0.85,
    maxNeighbors: 28,
    queryRadius: 620,
    candidateDirections: 32,
    boundaryPadding: 180,
    stuckSeconds: 1.2,
  },
  economy: {
    minRefreshReserve: 10,
    maxRefreshesPerShop: 2,
    lockAffordableHighValue: true,
  },
};

export function readAiEnabled(search = globalThis.location?.search || "", storage = globalThis.localStorage) {
  try {
    const params = new URLSearchParams(search);
    if (params.get("ai") === "1" || params.get("ai") === "true") return true;
    if (params.get("ai") === "0" || params.get("ai") === "false") return false;
  } catch {
    // Ignore invalid URLSearchParams input in tests or embedded pages.
  }
  try {
    return storage?.getItem(AI_STORAGE_ENABLED_KEY) === "1";
  } catch {
    return AI_CONFIG.enabled;
  }
}
