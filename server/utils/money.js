/**
 * Noesis.io Health — money & decimal helpers
 * © 2026 Athena Core Technologies, Inc.
 *
 * NOESIS platform standard: any financial computation must use Decimal.js
 * to avoid IEEE-754 binary float drift. This module is the single, narrow
 * surface through which $-math should flow. It is additive — existing
 * callers that pass plain numbers continue to work; the helpers normalize
 * to Decimal internally and return either Decimal instances (for chained
 * computation) or formatted strings (for serialization).
 *
 * Why this matters for healthcare:
 *   - EDI 835 / ERA reconciliation must match payer-reported cents exactly.
 *   - Patient cost estimates (deductible, copay, coinsurance) compound,
 *     so binary-float rounding cascades into incorrect patient bills.
 *   - HIPAA audit logs must be reproducible; non-deterministic rounding
 *     undermines the audit trail.
 */
const Decimal = require('decimal.js');

// USD precision: store with 4dp internally to absorb intermediate
// multiplications (e.g. coinsurance * allowed); render to 2dp.
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN, // banker's rounding — IRS / GAAP standard
  toExpNeg: -7,
  toExpPos: 21,
});

/**
 * Coerce any input (number | string | null | undefined | Decimal) into a
 * Decimal instance. Falsy / unparseable inputs become Decimal(0).
 * Never throws — money helpers must be total functions in audit context.
 */
function d(v) {
  if (v === null || v === undefined || v === '') {
    return new Decimal(0);
  }
  if (v instanceof Decimal) {
    return v;
  }
  try {
    const dec = new Decimal(v);
    if (dec.isNaN()) {
      return new Decimal(0);
    }
    return dec;
  } catch (_e) {
    return new Decimal(0);
  }
}

/** Sum a list of money-like values. */
function sum(values) {
  return (values || []).reduce((acc, v) => acc.plus(d(v)), new Decimal(0));
}

/** Multiply two money-like values; useful for `allowed * coinsurance`. */
function mul(a, b) {
  return d(a).times(d(b));
}

/** Subtract b from a. */
function sub(a, b) {
  return d(a).minus(d(b));
}

/** Round to 2 decimal places (banker's rounding) and return as Number.
 *  Use this only at the serialization boundary, NEVER in mid-computation. */
function toCents(v) {
  return Number(d(v).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2));
}

/** Format as fixed-2 string for EDI / ERA output. */
function toFixed2(v) {
  return d(v).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toFixed(2);
}

/** Compare two money-like values; returns -1, 0, or 1. */
function cmp(a, b) {
  return d(a).comparedTo(d(b));
}

/**
 * Compute patient out-of-pocket given a charge breakdown.
 * Deterministic — same inputs always produce same cents.
 *
 * @param {object} input
 * @param {number|string} input.allowed     - Payer-allowed amount
 * @param {number|string} input.deductibleRemaining
 * @param {number|string} input.copay
 * @param {number|string} input.coinsuranceRate  - 0..1 (e.g., 0.20)
 * @param {number|string} input.oopRemaining     - Patient OOP max remaining
 * @returns {{ patientResponsibility: number, breakdown: object }}
 */
function patientCostShare({ allowed, deductibleRemaining, copay, coinsuranceRate, oopRemaining }) {
  const allowedD = d(allowed);
  const dedD = d(deductibleRemaining);
  const copayD = d(copay);
  const coinsD = d(coinsuranceRate);
  const oopD = d(oopRemaining);

  // Deductible portion: min(allowed, deductibleRemaining)
  const dedPortion = allowedD.lessThan(dedD) ? allowedD : dedD;
  const afterDed = allowedD.minus(dedPortion);

  // Coinsurance applies after deductible
  const coinsPortion = afterDed.times(coinsD);

  // Total patient responsibility = deductible + copay + coinsurance, capped at OOP remaining
  const rawShare = dedPortion.plus(copayD).plus(coinsPortion);
  const cappedShare = rawShare.lessThan(oopD) ? rawShare : oopD;

  return {
    patientResponsibility: toCents(cappedShare),
    breakdown: {
      deductibleApplied: toCents(dedPortion),
      copay: toCents(copayD),
      coinsurance: toCents(coinsPortion),
      oopCapApplied: cappedShare.lessThan(rawShare),
      total: toCents(cappedShare),
    },
  };
}

module.exports = {
  d,
  sum,
  mul,
  sub,
  toCents,
  toFixed2,
  cmp,
  patientCostShare,
  Decimal,
};
