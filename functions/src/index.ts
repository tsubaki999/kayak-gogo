
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

type WeatherVars = {
  wind_ms: number; wind_dir_deg?: number;
  wave_h_m: number; swell_h_m: number; swell_tp_s: number;
  rain_mmph: number; visibility_km: number;
  thunder?: boolean; advisory?: { gale?: boolean; thunder?: boolean };
};

type Thresholds = {
  maxWindOk: number; maxWaveOk: number; maxSwellOk: number;
  minSwellTpOk: number; rainWarn: number; minVisibilityOk: number;
};

const clamp = (x:number,a=0,b=100)=>Math.max(a,Math.min(b,x));

function judge(vars: WeatherVars, th: Thresholds) {
  if (vars.thunder || vars.advisory?.gale || vars.advisory?.thunder) {
    return { label: "中止", score: 0, reasons: ["雷/警報により中止"] };
  }
  const windScore = clamp(100*(1-Math.max(0, vars.wind_ms - th.maxWindOk)/(th.maxWindOk+4)));
  const waveScore = clamp(100*(1-Math.max(0, vars.wave_h_m - th.maxWaveOk)/(th.maxWaveOk+0.7)));
  const swellPenalty = Math.max(0, vars.swell_h_m - th.maxSwellOk) * (vars.swell_tp_s < th.minSwellTpOk ? 1.0 : 0.5);
  const swellScore = clamp(100*(1 - swellPenalty/1.2));
  const rainScore = clamp(100*(1-Math.max(0, vars.rain_mmph - th.rainWarn)/(th.rainWarn+5)));
  const visScore  = clamp(100*Math.min(1, vars.visibility_km / th.minVisibilityOk));
  const S = Math.round(windScore*0.35 + waveScore*0.25 + swellScore*0.2 + rainScore*0.1 + visScore*0.1);
  const label = S >= 70 ? "OK" : S >= 40 ? "注意" : "中止";
  const reasons = [
    {k:"風速", v:`${vars.wind_ms.toFixed(1)} m/s`, loss:100-windScore},
    {k:"波高", v:`${vars.wave_h_m.toFixed(1)} m`, loss:100-waveScore},
    {k:"うねり", v:`${vars.swell_h_m.toFixed(1)} m / ${vars.swell_tp_s.toFixed(0)} s`, loss:100-swellScore},
    {k:"降水", v:`${vars.rain_mmph.toFixed(1)} mm/h`, loss:100-rainScore},
    {k:"視程", v:`${vars.visibility_km.toFixed(1)} km`, loss:100-visScore},
  ].sort((a,b)=>b.loss-a.loss).slice(0,3).map(x=>`${x.k} ${x.v}`);
  return { label, score: S, reasons };
}

export const judgeApi = onRequest({ region: "asia-northeast1", cors: true }, (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("POST only");
    const { vars, thresholds } = req.body as { vars: WeatherVars; thresholds: Thresholds; };
    if (!vars || !thresholds) return res.status(400).json({ ok:false, error:"missing vars/thresholds" });
    const result = judge(vars, thresholds);
    res.json({ ok: true, result });
  } catch (e:any) {
    logger.error(e);
    res.status(400).json({ ok:false, error: String(e?.message || e) });
  }
});
