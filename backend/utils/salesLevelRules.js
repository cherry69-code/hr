const getLevelRule = (level) => {
  const lvl = String(level || '').trim();
  if (['NE', 'N0', 'N1'].includes(lvl)) {
    return { multiplier: 5, basePct: 0.05, abovePct: 0.15 };
  }
  if (lvl === 'N2') {
    return { multiplier: 4, basePct: 0.03, abovePct: 0.07 };
  }
  if (lvl === 'N3') {
    return { multiplier: 3, basePct: 0.015, abovePct: 0.05 };
  }
  return { multiplier: 5, basePct: 0.05, abovePct: 0.15 };
};

module.exports = { getLevelRule };
