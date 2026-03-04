const { calculateIncentive } = require('./incentive.service');

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const calculatePayroll = async (employeeData) => {
  const annualCtc = Number(employeeData?.ctc ?? 0);
  if (!annualCtc || annualCtc <= 0) {
    throw new Error('CTC is required');
  }

  const ctcMonthly = annualCtc / 12;

  const basic = Number(employeeData?.monthlyBasic ?? ctcMonthly * 0.5);
  const hra = basic * 0.4;
  const employerPF = basic * 0.12;
  const employeePF = basic * 0.12;
  const gratuity = basic * 0.0481;

  const gross = basic + hra;

  const incentiveData = calculateIncentive({
    role: employeeData?.role,
    monthlyBasic: basic,
    target: employeeData?.target,
    achievedNR: employeeData?.achievedNR,
    teamIncentives: employeeData?.teamIncentives
  });

  const quarterlyIncentive = Number(incentiveData.quarterlyIncentive || 0);
  const monthlyIncentiveAccrual = quarterlyIncentive / 3;

  const esop = Number(incentiveData.esop || 0);
  const cashIncentive = Number(incentiveData.cash || 0);
  const override = Number(incentiveData.override || 0);

  let professionalTax = 200;
  if (gross < 15000) professionalTax = 0;

  let annualTax = 0;
  if (annualCtc > 700000) {
    annualTax = (annualCtc - 700000) * 0.1;
  }
  const monthlyTDS = annualTax / 12;

  const totalDeductions = employeePF + professionalTax + monthlyTDS;

  const netSalary = gross + monthlyIncentiveAccrual + override - totalDeductions;

  return {
    ctcAnnual: round2(annualCtc),
    ctcMonthly: round2(ctcMonthly),
    basic: round2(basic),
    hra: round2(hra),
    employerPF: round2(employerPF),
    employeePF: round2(employeePF),
    gratuity: round2(gratuity),
    gross: round2(gross),
    incentive: {
      achievementMultiple: incentiveData.achievementMultiple,
      quarterlyIncentive: round2(quarterlyIncentive),
      monthlyIncentiveAccrual: round2(monthlyIncentiveAccrual),
      esop: round2(esop),
      cashIncentive: round2(cashIncentive),
      override: round2(override)
    },
    deductions: {
      employeePF: round2(employeePF),
      professionalTax: round2(professionalTax),
      monthlyTDS: round2(monthlyTDS),
      totalDeductions: round2(totalDeductions)
    },
    netSalary: round2(netSalary)
  };
};

module.exports = { calculatePayroll };
