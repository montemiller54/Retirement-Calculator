// Contribution limits — re-exported from the central IRS tax-year file.
// To update for a new tax year, edit src/constants/irs-2026.ts.

export {
  CONTRIB_401K_LIMIT         as DEFAULT_401K_LIMIT,
  CONTRIB_401K_CATCHUP       as DEFAULT_401K_CATCHUP,
  CONTRIB_401K_SUPER_CATCHUP as DEFAULT_401K_SUPER_CATCHUP,
  CONTRIB_IRA_LIMIT          as DEFAULT_IRA_LIMIT,
  CONTRIB_IRA_CATCHUP        as DEFAULT_IRA_CATCHUP,
  CONTRIB_HSA_SELF_ONLY      as DEFAULT_HSA_SELF_ONLY,
  CATCHUP_AGE,
  SUPER_CATCHUP_START_AGE,
  SUPER_CATCHUP_END_AGE,
} from './irs-2026';
