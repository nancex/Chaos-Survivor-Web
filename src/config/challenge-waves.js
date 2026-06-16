// 挑战模式波次配置
// 每波定义：
//   type: "countdown" | "annihilation"
//   duration: number (仅 countdown 类型)
//   groups: [{ time: number, enemies: [{ id: string, count: number }] }]
//   boss: string (boss 波次，可选)

export const CHALLENGE_WAVES = [
  {
    wave: 1,
    type: "annihilation",
    groups: [
      { time: 0, enemies: [{ id: "zombie", count: 2, config: { speed: 100, hp: 800, scale: 1.3 } }] },
      { time: 5, enemies: [{ id: "zombie", count: 3, config: { speed: 240, hp: 200 } }, { id: "zombie", count: 2, config: { speed: 100, hp: 800, scale: 1.3 } }] },
      { time: 15, enemies: [{ id: "zombie", count: 3, config: { speed: 240, hp: 200 } }, { id: "zombie", count: 1, config: { speed: 100, hp: 800, scale: 1.3 } }] },
      { time: 25, enemies: [{ id: "zombie", count: 3, config: { speed: 240, hp: 200 } }] },
    ],
  },
  {
    wave: 2,
    type: "annihilation",
    groups: [
      { time: 0, enemies: [{ id: "lancer", count: 2, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 5, enemies: [{ id: "lancer", count: 2, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 10, enemies: [{ id: "lancer", count: 2, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 15, enemies: [{ id: "lancer", count: 3, config: { speed: 200, hp: 500, dashSpeed: 1000 } }] },
      { time: 999, enemies: [{ id: "lancer", count: 2, config: { speed: 200, hp: 1200, dashSpeed: 1000, scale: 1.5, attackCd: 0.5, recoverDuration: 0.2, windupDuration: 0.3, dashDuration: 0.5 } }] },
    ],
  },
];

export function challengeWaveScenario(wave) {
  return CHALLENGE_WAVES.find((entry) => entry.wave === wave) || null;
}

export function getChallengeTotalWaves() {
  return CHALLENGE_WAVES.reduce((max, entry) => Math.max(max, entry.wave), 0);
}