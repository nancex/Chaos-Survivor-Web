export function exportTrainingSummary(training = {}) {
  const totalRuns = training.totalRuns || 0;
  const victories = training.victories || 0;
  return {
    totalRuns,
    victories,
    winRate: totalRuns ? victories / totalRuns : 0,
    averageTime: totalRuns ? (training.totalTime || 0) / totalRuns : 0,
    recentRuns: (training.recentRuns || []).slice(-10),
    bestWeapons: rankedStats(training.weaponStats || {}),
    bestDifficulties: rankedStats(training.difficultyStats || {}),
    adjustments: training.adjustments || {},
  };
}

function rankedStats(stats) {
  return Object.entries(stats)
    .map(([id, value]) => ({
      id,
      runs: value.runs || 0,
      wins: value.wins || 0,
      winRate: value.runs ? value.wins / value.runs : 0,
      averageTime: value.runs ? (value.time || 0) / value.runs : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.averageTime - a.averageTime)
    .slice(0, 8);
}
