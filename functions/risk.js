// functions/risk.js
function judge(vars, thresholds) {
  const reasons = [];
  let score = 100;

  if (vars.wind > thresholds.maxWindOk) {
    reasons.push(`風速 ${vars.wind} m/s`);
    score -= 30;
  }
  if (vars.wave > thresholds.maxWaveOk) {
    reasons.push(`波高 ${vars.wave} m`);
    score -= 30;
  }
  if (vars.swellH > thresholds.maxSwellOk) {
    reasons.push(`うねり ${vars.swellH} m`);
    score -= 20;
  }
  if (vars.swellTp < thresholds.minSwellTpOk) {
    reasons.push(`うねり周期 ${vars.swellTp} s`);
    score -= 20;
  }

  let label = "OK";
  if (score < 70) label = "注意";
  if (score < 40) label = "中止";

  return { label, score, reasons };
}

module.exports = { judge };
