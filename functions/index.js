// functions/index.js (ESM + Firebase Functions v2)
import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import admin from "firebase-admin";

setGlobalOptions({ region: "asia-northeast1", runtime: "nodejs20" });

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

/* ---------------- 判定ロジック ---------------- */
const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));
function judge(vars, th) {
  if (vars.thunder || (vars.advisory && (vars.advisory.gale || vars.advisory.thunder))) {
    return { label: "中止", score: 0, reasons: ["雷/警報により中止"] };
  }

  const windScore = clamp(100 * (1 - Math.max(0, vars.wind_ms - th.maxWindOk) / (th.maxWindOk + 4)));
  const waveScore = clamp(100 * (1 - Math.max(0, vars.wave_h_m - th.maxWaveOk) / (th.maxWaveOk + 0.7)));
  const swellPenalty = Math.max(0, vars.swell_h_m - th.maxSwellOk) * (vars.swell_tp_s < th.minSwellTpOk ? 1.0 : 0.5);
  const swellScore = clamp(100 * (1 - swellPenalty / 1.2));
  const rainScore = clamp(100 * (1 - Math.max(0, vars.rain_mmph - th.rainWarn) / (th.rainWarn + 5)));
  const visScore  = clamp(100 * Math.min(1, vars.visibility_km / th.minVisibilityOk));

  const S = Math.round(
    windScore * 0.35 +
    waveScore * 0.25 +
    swellScore * 0.20 +
    rainScore * 0.10 +
    visScore  * 0.10
  );

  const label = S >= 70 ? "OK" : S >= 40 ? "注意" : "中止";

  const reasons = [
    { k: "風速", v: `${vars.wind_ms?.toFixed(1) ?? "?"} m/s`, loss: 100 - windScore },
    { k: "波高", v: `${vars.wave_h_m?.toFixed(1) ?? "?"} m`, loss: 100 - waveScore },
    { k: "うねり", v: `${vars.swell_h_m?.toFixed(1) ?? "?"} m / ${vars.swell_tp_s?.toFixed(0) ?? "?"} s`, loss: 100 - swellScore },
    { k: "降水", v: `${vars.rain_mmph?.toFixed(1) ?? "?"} mm/h`, loss: 100 - rainScore },
    { k: "視程", v: `${vars.visibility_km?.toFixed(1) ?? "?"} km`, loss: 100 - visScore },
  ]
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
    .map(x => `${x.k} ${x.v}`);

  return { label, score: S, reasons };
}

/* ---------------- Open-Meteo からの自動取得 ---------------- */
async function fetchWeatherFromOpenMeteo(lat, lon, atISO) {
  const t = atISO ? new Date(atISO) : new Date();
  const tz = "UTC";

  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=wind_speed_10m,precipitation,visibility&timezone=${tz}`;
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&hourly=wave_height,swell_wave_height,swell_wave_period&timezone=${tz}`;

  const [wRes, mRes] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
  if (!wRes.ok || !mRes.ok) throw new Error("Open-Meteo API error");

  const [wJson, mJson] = await Promise.all([wRes.json(), mRes.json()]);

  const pickIndex = (timeArr) => {
    let idx = 0, best = Infinity;
    for (let i = 0; i < timeArr.length; i++) {
      const diff = Math.abs(new Date(timeArr[i]).getTime() - t.getTime());
      if (diff < best) { best = diff; idx = i; }
    }
    return idx;
  };

  const wi = pickIndex(wJson.hourly?.time || []);
  const mi = pickIndex(mJson.hourly?.time || []);

  return {
    wind_ms:       Number(wJson.hourly?.wind_speed_10m?.[wi] ?? 0),
    rain_mmph:     Number(wJson.hourly?.precipitation?.[wi] ?? 0),
    visibility_km: Number(wJson.hourly?.visibility?.[wi] ?? 20000) / 1000,
    wave_h_m:      Number(mJson.hourly?.wave_height?.[mi] ?? 0),
    swell_h_m:     Number(mJson.hourly?.swell_wave_height?.[mi] ?? 0),
    swell_tp_s:    Number(mJson.hourly?.swell_wave_period?.[mi] ?? 0),
    thunder: false,
    advisory: null,
  };
}

/* ---------------- HTTPS エンドポイント ---------------- */
export const judgeApi = onRequest({ cors: true }, async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("POST only");

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { vars, thresholds, save, lat, lon, at, presetId } = body || {};

    let v;
    if (!vars) {
      if (typeof lat !== "number" || typeof lon !== "number") {
        return res.status(400).json({ ok: false, error: "missing vars or lat/lon" });
      }
      v = await fetchWeatherFromOpenMeteo(lat, lon, at);
    } else {
      const N = (x, d = 0) => (typeof x === "number" ? x : Number(x ?? d));
      v = {
        wind_ms:       N(vars.wind_ms ?? vars.wind, 0),
        wave_h_m:      N(vars.wave_h_m ?? vars.wave, 0),
        swell_h_m:     N(vars.swell_h_m ?? vars.swellH, 0),
        swell_tp_s:    N(vars.swell_tp_s ?? vars.swellTp, 0),
        rain_mmph:     N(vars.rain_mmph ?? vars.rain, 0),
        visibility_km: N(vars.visibility_km ?? vars.visibility, 20),
        thunder:       !!(vars.thunder ?? false),
        advisory:      vars.advisory ?? null,
      };
    }

    const DEFAULT_TH = {
      maxWindOk: 6, maxWaveOk: 1.0, maxSwellOk: 1.2,
      minSwellTpOk: 9, rainWarn: 4, minVisibilityOk: 2,
    };
    const th = { ...DEFAULT_TH, ...(thresholds || {}) };

    const result = judge(v, th);

    if (save === true) {
      await db.collection("logs").add({
        at: at || new Date().toISOString(),
        lat: lat ?? null,
        lon: lon ?? null,
        presetId: presetId ?? null,
        label: result.label,
        score: result.score,
        reasons: result.reasons,
        v: "v1",
      });
    }

    return res.json({ ok: true, result, usedVars: v });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});
