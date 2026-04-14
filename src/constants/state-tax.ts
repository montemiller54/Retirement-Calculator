/**
 * State tax data for all 50 states + DC.
 *
 * Each state has:
 *  - label: display name
 *  - rate: effective flat/top marginal rate (for progressive states, uses weighted effective rate at typical retirement income)
 *  - noIncomeTax: true if state has no income tax
 *  - ssExempt: true if Social Security is fully exempt from state tax
 *  - retirementExemptAge: age at which pension/traditional withdrawals become exempt (null = never)
 *  - retirementExemptAmount: annual dollar exemption for retirement income (0 = none, Infinity = full exemption)
 *
 * Sources: Tax Foundation, state DOR publications (2025-2026 estimates)
 */

export interface StateTaxInfo {
  label: string;
  rate: number;
  noIncomeTax: boolean;
  ssExempt: boolean;
  retirementExemptAge: number | null; // age for retirement income exemption; null = no age-based exemption
  retirementExemptAmount: number;     // annual $ exempt; 0 = none, Infinity = fully exempt
}

export const STATE_TAX_DATA: Record<string, StateTaxInfo> = {
  AL: { label: 'Alabama',        rate: 0.050, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  AK: { label: 'Alaska',         rate: 0.000, noIncomeTax: true,  ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
  AZ: { label: 'Arizona',        rate: 0.025, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 2500 },
  AR: { label: 'Arkansas',       rate: 0.039, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 6000 },
  CA: { label: 'California',     rate: 0.093, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  CO: { label: 'Colorado',       rate: 0.044, noIncomeTax: false, ssExempt: false, retirementExemptAge: 55,   retirementExemptAmount: 20000 },
  CT: { label: 'Connecticut',    rate: 0.050, noIncomeTax: false, ssExempt: false, retirementExemptAge: null, retirementExemptAmount: 0 },
  DE: { label: 'Delaware',       rate: 0.066, noIncomeTax: false, ssExempt: true,  retirementExemptAge: 60,   retirementExemptAmount: 12500 },
  DC: { label: 'Washington DC',  rate: 0.065, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  FL: { label: 'Florida',        rate: 0.000, noIncomeTax: true,  ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
  GA: { label: 'Georgia',        rate: 0.055, noIncomeTax: false, ssExempt: true,  retirementExemptAge: 62,   retirementExemptAmount: 35000 },
  HI: { label: 'Hawaii',         rate: 0.072, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  ID: { label: 'Idaho',          rate: 0.058, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  IL: { label: 'Illinois',       rate: 0.0495,noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
  IN: { label: 'Indiana',        rate: 0.0305,noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  IA: { label: 'Iowa',           rate: 0.038, noIncomeTax: false, ssExempt: true,  retirementExemptAge: 55,   retirementExemptAmount: Infinity },
  KS: { label: 'Kansas',         rate: 0.057, noIncomeTax: false, ssExempt: false, retirementExemptAge: null, retirementExemptAmount: 0 },
  KY: { label: 'Kentucky',       rate: 0.040, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 31110 },
  LA: { label: 'Louisiana',      rate: 0.045, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 6000 },
  ME: { label: 'Maine',          rate: 0.072, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 10000 },
  MD: { label: 'Maryland',       rate: 0.057, noIncomeTax: false, ssExempt: true,  retirementExemptAge: 65,   retirementExemptAmount: 36200 },
  MA: { label: 'Massachusetts',  rate: 0.050, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  MI: { label: 'Michigan',       rate: 0.0425,noIncomeTax: false, ssExempt: true,  retirementExemptAge: 67,   retirementExemptAmount: 56961 },
  MN: { label: 'Minnesota',      rate: 0.068, noIncomeTax: false, ssExempt: false, retirementExemptAge: null, retirementExemptAmount: 0 },
  MS: { label: 'Mississippi',    rate: 0.050, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
  MO: { label: 'Missouri',       rate: 0.048, noIncomeTax: false, ssExempt: true,  retirementExemptAge: 62,   retirementExemptAmount: 6000 },
  MT: { label: 'Montana',        rate: 0.059, noIncomeTax: false, ssExempt: false, retirementExemptAge: null, retirementExemptAmount: 4640 },
  NE: { label: 'Nebraska',       rate: 0.058, noIncomeTax: false, ssExempt: false, retirementExemptAge: null, retirementExemptAmount: 0 },
  NV: { label: 'Nevada',         rate: 0.000, noIncomeTax: true,  ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
  NH: { label: 'New Hampshire',  rate: 0.000, noIncomeTax: true,  ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
  NJ: { label: 'New Jersey',     rate: 0.064, noIncomeTax: false, ssExempt: true,  retirementExemptAge: 62,   retirementExemptAmount: 100000 },
  NM: { label: 'New Mexico',     rate: 0.049, noIncomeTax: false, ssExempt: false, retirementExemptAge: 65,   retirementExemptAmount: 8000 },
  NY: { label: 'New York',       rate: 0.068, noIncomeTax: false, ssExempt: true,  retirementExemptAge: 59,   retirementExemptAmount: 20000 },
  NC: { label: 'North Carolina', rate: 0.045, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  ND: { label: 'North Dakota',   rate: 0.019, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  OH: { label: 'Ohio',           rate: 0.035, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  OK: { label: 'Oklahoma',       rate: 0.048, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 10000 },
  OR: { label: 'Oregon',         rate: 0.088, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  PA: { label: 'Pennsylvania',   rate: 0.0307,noIncomeTax: false, ssExempt: true,  retirementExemptAge: 59,   retirementExemptAmount: Infinity },
  RI: { label: 'Rhode Island',   rate: 0.060, noIncomeTax: false, ssExempt: false, retirementExemptAge: null, retirementExemptAmount: 0 },
  SC: { label: 'South Carolina', rate: 0.064, noIncomeTax: false, ssExempt: true,  retirementExemptAge: 65,   retirementExemptAmount: 10000 },
  SD: { label: 'South Dakota',   rate: 0.000, noIncomeTax: true,  ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
  TN: { label: 'Tennessee',      rate: 0.000, noIncomeTax: true,  ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
  TX: { label: 'Texas',          rate: 0.000, noIncomeTax: true,  ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
  UT: { label: 'Utah',           rate: 0.0465,noIncomeTax: false, ssExempt: false, retirementExemptAge: null, retirementExemptAmount: 0 },
  VT: { label: 'Vermont',        rate: 0.066, noIncomeTax: false, ssExempt: false, retirementExemptAge: null, retirementExemptAmount: 0 },
  VA: { label: 'Virginia',       rate: 0.0575,noIncomeTax: false, ssExempt: true,  retirementExemptAge: 65,   retirementExemptAmount: 12000 },
  WA: { label: 'Washington',     rate: 0.000, noIncomeTax: true,  ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
  WV: { label: 'West Virginia',  rate: 0.051, noIncomeTax: false, ssExempt: false, retirementExemptAge: null, retirementExemptAmount: 0 },
  WI: { label: 'Wisconsin',      rate: 0.053, noIncomeTax: false, ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: 0 },
  WY: { label: 'Wyoming',        rate: 0.000, noIncomeTax: true,  ssExempt: true,  retirementExemptAge: null, retirementExemptAmount: Infinity },
};

// Sorted list for UI dropdowns
export const STATE_CODES = Object.keys(STATE_TAX_DATA).sort() as string[];

/**
 * Calculate state income tax.
 * Handles no-income-tax states, SS exemption, and retirement income exemption.
 */
export function calculateStateTax(input: {
  stateCode: string;
  wages: number;
  socialSecurity: number;
  pension: number;
  traditionalWithdrawals: number;
  capitalGains: number;
  taxableInterest: number;
  otherTaxableIncome: number;
  age: number;
}): number {
  const state = STATE_TAX_DATA[input.stateCode];
  if (!state || state.noIncomeTax) return 0;

  // Start with non-retirement income
  let taxableIncome = input.wages + input.capitalGains + input.taxableInterest + input.otherTaxableIncome;

  // Social Security: only add if state taxes it
  if (!state.ssExempt) {
    taxableIncome += input.socialSecurity;
  }

  // Retirement income (pension + traditional withdrawals)
  const retirementIncome = input.pension + input.traditionalWithdrawals;
  if (retirementIncome > 0) {
    const meetsAge = state.retirementExemptAge !== null && input.age >= state.retirementExemptAge;
    if (meetsAge && state.retirementExemptAmount === Infinity) {
      // Fully exempt — don't add retirement income
    } else if (meetsAge && state.retirementExemptAmount > 0) {
      // Partially exempt — add only the amount above exemption
      taxableIncome += Math.max(0, retirementIncome - state.retirementExemptAmount);
    } else if (!meetsAge && state.retirementExemptAmount === Infinity && state.retirementExemptAge !== null) {
      // Not yet old enough for age-based exemption — fully taxed
      taxableIncome += retirementIncome;
    } else if (state.retirementExemptAge === null && state.retirementExemptAmount === Infinity) {
      // Always fully exempt regardless of age (e.g., IL, MS, PA)
      // Don't add retirement income
    } else if (state.retirementExemptAge === null && state.retirementExemptAmount > 0) {
      // Dollar exemption with no age requirement
      taxableIncome += Math.max(0, retirementIncome - state.retirementExemptAmount);
    } else {
      // No exemption or no age-based exemption and no dollar exemption
      taxableIncome += retirementIncome;
    }
  }

  return Math.max(0, taxableIncome) * state.rate;
}
