const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getRoleFactor = (role) => {
  const normalized = String(role || '').toUpperCase();
  const map = {
    N1: 1,
    N2: 1.15,
    N3: 1.3,
    MANAGER: 1.5,
    LEAD: 1.4
  };
  return map[normalized] ?? 1;
};

const calculateIncentive = ({ role, monthlyBasic, target, achievedNR, teamIncentives }) => {
  const basic = Number(monthlyBasic || 0);
  const t = Number(target || 0);
  const achieved = Number(achievedNR || 0);

  const achievementMultiple = t > 0 ? achieved / t : 0;
  const roleFactor = getRoleFactor(role);

  const scaledMultiple = clamp(achievementMultiple, 0, 3);
  const quarterlyIncentive = basic * 3 * 0.5 * scaledMultiple * roleFactor;

  const cash = quarterlyIncentive * 0.8;
  const esop = quarterlyIncentive * 0.2;
  const override = Number(teamIncentives || 0);

  return {
    achievementMultiple: round2(achievementMultiple),
    quarterlyIncentive: round2(quarterlyIncentive),
    cash: round2(cash),
    esop: round2(esop),
    override: round2(override)
  };
};

module.exports = { calculateIncentive };

