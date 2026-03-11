const asyncHandler = require('../middlewares/asyncHandler');
const User = require('../models/User');
const SalesRevenue = require('../models/SalesRevenue');
const LeaderboardStat = require('../models/LeaderboardStat');
const leaderboardCache = require('../utils/leaderboardCache');
const { getLevelRule } = require('../utils/salesLevelRules');
const { decryptField } = require('../utils/fieldCrypto');

const toNumber = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));

const getBadge = (achievementPercent) => {
  const x = Number(achievementPercent || 0);
  if (x >= 200) return 'Platinum Closer';
  if (x >= 150) return 'Gold Performer';
  if (x >= 100) return 'Silver Performer';
  if (x >= 80) return 'Bronze Performer';
  return '';
};

const monthRange = (month, year) => {
  const start = new Date(Number(year), Number(month) - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
  return { start, end };
};

const mondayStart = (d) => {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
};

const buildHierarchy = (employees) => {
  const direct = new Map();
  for (const e of employees) {
    if (!e.reportingManagerId) continue;
    const mgr = String(e.reportingManagerId);
    if (!direct.has(mgr)) direct.set(mgr, []);
    direct.get(mgr).push(String(e._id));
  }

  const collectDescendants = (rootId) => {
    const seen = new Set();
    const queue = [String(rootId)];
    while (queue.length) {
      const cur = queue.shift();
      const children = direct.get(cur) || [];
      for (const child of children) {
        if (seen.has(child)) continue;
        seen.add(child);
        queue.push(child);
      }
    }
    return Array.from(seen);
  };

  return { direct, collectDescendants };
};

const getAllowedEmployeeIds = async (req, allEmployees) => {
  if (req.user.role !== 'manager') return null;
  const reportees = await User.find({ reportingManagerId: req.user._id }).select('_id').lean();
  const allowed = new Set([String(req.user._id), ...reportees.map((r) => String(r._id))]);
  const filtered = allEmployees.filter((e) => allowed.has(String(e._id)));
  return { allowedSet: allowed, employees: filtered };
};

const computeLeaderboard = async ({ req, month, year, departmentId, teamId, level, projectName, top = 10 }) => {
  const { start, end } = monthRange(month, year);

  const employeeQuery = { role: { $in: ['employee', 'manager'] }, level: { $in: ['NE', 'N0', 'N1', 'N2', 'N3'] }, status: 'active' };
  if (departmentId) employeeQuery.departmentId = departmentId;
  if (teamId) employeeQuery.teamId = teamId;
  if (level) employeeQuery.level = level;

  let employees = await User.find(employeeQuery)
    .select('fullName employeeId level salary.ctc reportingManagerId departmentId teamId profilePicture')
    .lean();

  const mgrScope = await getAllowedEmployeeIds(req, employees);
  if (mgrScope) employees = mgrScope.employees;

  const employeeIds = employees.map((e) => e._id);

  const match = { bookingDate: { $gte: start, $lte: end }, employeeId: { $in: employeeIds } };
  if (projectName) match.projectName = new RegExp(String(projectName), 'i');

  const revenueGroups = await SalesRevenue.aggregate([
    { $match: match },
    { $group: { _id: '$employeeId', totalRevenue: { $sum: '$revenueAmount' } } }
  ]);

  const revenueByEmp = new Map(revenueGroups.map((g) => [String(g._id), Number(g.totalRevenue || 0)]));

  const { direct, collectDescendants } = buildHierarchy(employees);

  const stats = employees.map((e) => {
    const id = String(e._id);
    let revenue = revenueByEmp.get(id) || 0;
    if (String(e.level) === 'N2') {
      const team = direct.get(id) || [];
      for (const childId of team) revenue += revenueByEmp.get(childId) || 0;
    } else if (String(e.level) === 'N3') {
      const team = collectDescendants(id);
      for (const childId of team) revenue += revenueByEmp.get(childId) || 0;
    }

    const annualCtc = Number(decryptField(e?.salary?.ctc ?? 0) || 0);
    const monthlySalary = annualCtc / 12;
    const target = monthlySalary * getLevelRule(String(e.level)).multiplier;
    const achievement = target > 0 ? (revenue / target) * 100 : 0;
    const badge = getBadge(achievement);

    return {
      employeeId: e._id,
      employeeCode: e.employeeId,
      name: e.fullName,
      level: e.level,
      departmentId: e.departmentId,
      teamId: e.teamId,
      profilePicture: e.profilePicture,
      revenue,
      target,
      achievement,
      badge
    };
  });

  stats.sort((a, b) => {
    if (b.achievement !== a.achievement) return b.achievement - a.achievement;
    if (b.revenue !== a.revenue) return b.revenue - a.revenue;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const ranked = stats.map((s, idx) => ({ ...s, rank: idx + 1 }));

  const writes = ranked.map((s) => ({
    updateOne: {
      filter: { employeeId: s.employeeId, month: Number(month), year: Number(year) },
      update: {
        $set: {
          totalRevenue: s.revenue,
          targetRevenue: s.target,
          achievementPercent: s.achievement,
          rank: s.rank,
          badge: s.badge,
          lastUpdated: new Date()
        }
      },
      upsert: true
    }
  }));

  if (writes.length) {
    await LeaderboardStat.bulkWrite(writes, { ordered: false }).catch(() => {});
  }

  const topList = ranked.slice(0, top);
  const topPerformer = ranked.length ? ranked[0] : null;

  return { month: Number(month), year: Number(year), top: topList, allCount: ranked.length, topPerformer, ranked };
};

exports.getMonthlyLeaderboard = asyncHandler(async (req, res) => {
  const month = Number(req.query.month || new Date().getMonth() + 1);
  const year = Number(req.query.year || new Date().getFullYear());
  if (!month || month < 1 || month > 12 || !year) {
    return res.status(400).json({ success: false, error: 'Invalid month/year' });
  }

  const cacheKey = `monthly:${req.user.role}:${req.user._id}:${month}:${year}:${String(req.query.departmentId || '')}:${String(req.query.teamId || '')}:${String(req.query.level || '')}:${String(req.query.projectName || '')}:${String(req.query.top || 10)}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached) return res.status(200).json({ success: true, ...cached });

  const top = Number(req.query.top || 10);
  const result = await computeLeaderboard({
    req,
    month,
    year,
    departmentId: req.query.departmentId || '',
    teamId: req.query.teamId || '',
    level: req.query.level || '',
    projectName: req.query.projectName || '',
    top
  });

  const payload = { data: result.top, topPerformer: result.topPerformer, month: result.month, year: result.year, count: result.allCount };
  leaderboardCache.set(cacheKey, payload, 30000);
  return res.status(200).json({ success: true, ...payload });
});

exports.getMyLeaderboardStats = asyncHandler(async (req, res) => {
  const month = Number(req.query.month || new Date().getMonth() + 1);
  const year = Number(req.query.year || new Date().getFullYear());
  if (!month || month < 1 || month > 12 || !year) {
    return res.status(400).json({ success: false, error: 'Invalid month/year' });
  }

  const employeeId = req.query.employeeId && ['admin', 'hr'].includes(req.user.role) ? String(req.query.employeeId) : String(req.user._id);

  const cacheKey = `me:${req.user.role}:${req.user._id}:${employeeId}:${month}:${year}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached) return res.status(200).json({ success: true, data: cached });

  const result = await computeLeaderboard({ req, month, year, top: 1000 });
  const me = result.ranked.find((r) => String(r.employeeId) === employeeId) || null;
  leaderboardCache.set(cacheKey, me, 30000);
  return res.status(200).json({ success: true, data: me });
});

exports.getWeeklyLeaderboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const start = mondayStart(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const cacheKey = `weekly:${req.user.role}:${req.user._id}:${start.toISOString().slice(0, 10)}:${String(req.query.departmentId || '')}:${String(req.query.teamId || '')}:${String(req.query.level || '')}:${String(req.query.projectName || '')}:${String(req.query.top || 10)}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached) return res.status(200).json({ success: true, ...cached });

  const employeeQuery = { role: { $in: ['employee', 'manager'] }, level: { $in: ['NE', 'N0', 'N1', 'N2', 'N3'] }, status: 'active' };
  if (req.query.departmentId) employeeQuery.departmentId = req.query.departmentId;
  if (req.query.teamId) employeeQuery.teamId = req.query.teamId;
  if (req.query.level) employeeQuery.level = req.query.level;

  let employees = await User.find(employeeQuery)
    .select('fullName employeeId level salary.ctc reportingManagerId departmentId teamId profilePicture')
    .lean();

  const mgrScope = await getAllowedEmployeeIds(req, employees);
  if (mgrScope) employees = mgrScope.employees;

  const employeeIds = employees.map((e) => e._id);

  const match = { bookingDate: { $gte: start, $lte: end }, employeeId: { $in: employeeIds } };
  if (req.query.projectName) match.projectName = new RegExp(String(req.query.projectName), 'i');

  const revenueGroups = await SalesRevenue.aggregate([
    { $match: match },
    { $group: { _id: '$employeeId', totalRevenue: { $sum: '$revenueAmount' } } }
  ]);

  const revenueByEmp = new Map(revenueGroups.map((g) => [String(g._id), Number(g.totalRevenue || 0)]));
  const rows = employees
    .map((e) => ({
      employeeId: e._id,
      employeeCode: e.employeeId,
      name: e.fullName,
      level: e.level,
      profilePicture: e.profilePicture,
      revenue: revenueByEmp.get(String(e._id)) || 0
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .map((r, idx) => ({ ...r, rank: idx + 1 }));

  const top = Number(req.query.top || 10);
  const payload = { data: rows.slice(0, top), start, end };
  leaderboardCache.set(cacheKey, payload, 30000);
  return res.status(200).json({ success: true, ...payload });
});

exports.invalidateLeaderboardCache = () => {
  leaderboardCache.invalidatePrefix('monthly:');
  leaderboardCache.invalidatePrefix('weekly:');
  leaderboardCache.invalidatePrefix('me:');
};
