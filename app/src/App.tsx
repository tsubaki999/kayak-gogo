// app/src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import { judge, Thresholds } from "./risk";
import mockNormal from "./mock_kannonzaki.json";
import mockStorm from "./mock_storm.json";
import { ensurePresets, loadPresets, saveLog } from "./fs";
import { postJudge, UsedVars } from "./http";
import MapPicker from "./MapPicker";
import { readParams, writeParams } from "./qparams";
import SpotsLayer from "./SpotsLayer";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import WindyEmbed from "./WindyEmbed";
import SpotsPanel from "./SpotsPanel";
import spots from "./spots.json"; // resolveJsonModule: true が必要

// Leaflet のデフォルトアイコン（Vite 対策）
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/marker-icon-2x.png",
  iconUrl: "/marker-icon.png",
  shadowUrl: "/marker-shadow.png",
});

type PresetDoc = { id: string; name: string; thresholds: Thresholds };

const DEFAULT_TH: Thresholds = {
  maxWindOk: 6,
  maxWaveOk: 1.0,
  maxSwellOk: 1.2,
  minSwellTpOk: 9,
  rainWarn: 4,
  minVisibilityOk: 2,
};

export default function App() {
  // ▼ 地点/時刻/プリセット
  const start = readParams();
  const [lat, setLat] = useState(start.lat ?? 35.249);
  const [lon, setLon] = useState(start.lon ?? 139.722);
  const [time, setTime] = useState(start.t ?? new Date().toISOString().slice(0, 16));
  const [presets, setPresets] = useState<PresetDoc[]>([]);
  const [presetId, setPresetId] = useState(start.preset ?? "inner-bay");

  // ▼ しきい値・モード
  const [th, setTh] = useState(DEFAULT_TH);
  const [mode, setMode] = useState<"normal" | "storm">("normal");
  const [serverMode, setServerMode] = useState(false);
  const [result, setResult] = useState<{ label: string; score: number; reasons: string[] } | null>(null);
  const [usedVars, setUsedVars] = useState<UsedVars | null>(null);

  // ▼ Windy 表示オーバーレイ
  const [overlay, setOverlay] = useState<"wind" | "waves" | "rain" | "swell" | "gust">("wind");

  // ▼ スポットの判定状態（マーカー色分けに利用）
  const [spotStatuses, setSpotStatuses] = useState<Record<string, "OK" | "注意" | "中止">>({});

  // ▼ しきい値スライダーの折りたたみ（← Hook は関数内に！）
  const [showThresholds, setShowThresholds] = useState(false);

  // 初期化：プリセット投入＆取得
  useEffect(() => {
    ensurePresets()
      .then(loadPresets)
      .then((ps) => setPresets(ps as PresetDoc[]))
      .catch(() => {});
  }, []);

  // プリセット変更時にしきい値を上書き
  useEffect(() => {
    const p = presets.find((p) => p.id === presetId);
    if (p) setTh(p.thresholds);
  }, [presetId, presets]);

  // URL 同期
  useEffect(() => {
    writeParams({ lat, lon, t: time, preset: presetId });
  }, [lat, lon, time, presetId]);

  // 入力データ（モック）
  const vars = mode === "storm" ? (mockStorm as any).vars : (mockNormal as any).vars;
  const local = useMemo(() => judge(vars, th), [vars, th]);

  // 判定実行
  async function runJudge() {
    let r: { label: string; score: number; reasons: string[] };

    if (serverMode) {
      const res = await postJudge({
        lat,
        lon,
        at: new Date(time).toISOString(),
        presetId,
        thresholds: th,
        save: true,
      });
      r = res.result;
      setUsedVars(res.usedVars ?? null);
    } else {
      r = local;
      setUsedVars({
        wind_ms: Number(vars.wind ?? 0),
        wave_h_m: Number(vars.wave ?? 0),
        swell_h_m: Number(vars.swellH ?? 0),
        swell_tp_s: Number(vars.swellTp ?? 0),
        rain_mmph: Number(vars.rain ?? 0),
        visibility_km: Number(vars.visibility ?? 20),
        thunder: !!vars.thunder,
        advisory: vars.advisory ?? null,
      });
    }

    setResult(r);
    saveLog(presetId, lat, lon, time, r).catch((err) => console.error("ログ保存に失敗しました:", err));
  }

  const r = result || local;

  return (
    <main style={{ padding: 16, maxWidth: 560, margin: "0 auto" }}>
      <h1>出艇判断チェッカー</h1>

      {/* 地点 & 時刻 */}
      <div style={{ display: "grid", gap: 12, margin: "12px 0" }}>
        <MapPicker lat={lat} lon={lon} onPick={(a, b) => { setLat(a); setLon(b); }}>
          <SpotsLayer
            spots={spots as any}
            statuses={spotStatuses}
            onSelect={(a, b) => { setLat(a); setLon(b); }}
          />
        </MapPicker>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, opacity: 0.7 }}>緯度</label>
            <input value={lat.toFixed(5)} onChange={(e) => setLat(parseFloat(e.target.value || "0"))} style={{ width: "100%" }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontSize: 12, opacity: 0.7 }}>経度</label>
            <input value={lon.toFixed(5)} onChange={(e) => setLon(parseFloat(e.target.value || "0"))} style={{ width: "100%" }} />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, opacity: 0.7 }}>日時</label>
          <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: "100%" }} />
        </div>
      </div>

      {/* プリセットとモード */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <label><input type="radio" checked={mode === "normal"} onChange={() => setMode("normal")} /> 通常</label>
        <label><input type="radio" checked={mode === "storm"} onChange={() => setMode("storm")} /> 時化</label>

        <label style={{ marginLeft: "auto" }}>
          <input type="checkbox" checked={serverMode} onChange={(e) => setServerMode(e.target.checked)} />
          Cloud Functionsで判定
        </label>
      </div>

      {/* しきい値スライダー（折りたたみ） */}
      <section style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0 }}>しきい値</h3>
          <button
            onClick={() => setShowThresholds((v) => !v)}
            style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #ccc", background: "#f8f8f8", cursor: "pointer" }}
          >
            {showThresholds ? "閉じる ▲" : "開く ▼"}
          </button>
          <small style={{ opacity: 0.6 }}>（プリセットから自動設定・微調整可）</small>
        </div>

        {showThresholds && (
          <div style={{ marginTop: 8 }}>
            <Slider label="最大 風速 OK (m/s)" value={th.maxWindOk} min={2} max={10} onChange={(v) => setTh({ ...th, maxWindOk: v })} />
            <Slider label="最大 波高 OK (m)" value={th.maxWaveOk} min={0.3} max={1.8} step={0.1} onChange={(v) => setTh({ ...th, maxWaveOk: v })} />
            <Slider label="最大 うねり高 OK (m)" value={th.maxSwellOk} min={0.5} max={2.0} step={0.1} onChange={(v) => setTh({ ...th, maxSwellOk: v })} />
            <Slider label="最小 うねり周期 OK (s)" value={th.minSwellTpOk} min={6} max={12} onChange={(v) => setTh({ ...th, minSwellTpOk: v })} />
          </div>
        )}
      </section>

      {/* 判定 */}
      <button onClick={runJudge} style={{ padding: "10px 16px", fontWeight: 700 }}>
        判定する
      </button>

      <ResultCard label={r.label as any} score={r.score} reasons={r.reasons} />

      {/* 実測値カード */}
      {usedVars && <ObservedCard v={usedVars} th={th} />}

      {/* Windy + 周辺スポット */}
      <section style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <strong>天気予報レイヤー（Windy）</strong>
          <select value={overlay} onChange={(e) => setOverlay(e.target.value as any)}>
            <option value="wind">風（ベクトル）</option>
            <option value="waves">波浪</option>
            <option value="swell">うねり</option>
            <option value="rain">降水</option>
            <option value="gust">ガスト</option>
          </select>
        </div>
        <WindyEmbed lat={lat} lon={lon} zoom={9} overlay={overlay} height={360} />

        <SpotsPanel
          center={{ lat, lon }}
          atISO={new Date(time).toISOString()}
          th={th}
          limitKm={50}
          onStatuses={(map) => setSpotStatuses(map)}
        />
      </section>

      <div style={{ marginTop: 8 }}>
        <small style={{ opacity: 0.8 }}>このページURLを共有すると、地点/時刻/プリセットが復元されます。</small>
      </div>

      <small style={{ opacity: 0.7, display: "block", marginTop: 8 }}>
        データ: {mode === "storm" ? "mock_storm" : "mock_normal"} / lat {lat.toFixed(3)}, lon {lon.toFixed(3)} / {time}
      </small>
    </main>
  );
}

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 10,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div style={{ margin: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: "100%" }} />
    </div>
  );
}

function ResultCard({
  label,
  score,
  reasons,
}: {
  label: "OK" | "注意" | "中止";
  score: number;
  reasons: string[];
}) {
  const bg = label === "OK" ? "#e6f7e8" : label === "注意" ? "#fff6e5" : "#ffebee";
  const fg = label === "OK" ? "#137333" : label === "注意" ? "#8a6d00" : "#b00020";
  return (
    <div style={{ background: bg, border: `1px solid ${fg}`, borderRadius: 12, padding: 16, margin: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 24, color: fg, fontWeight: 700 }}>{label}</span>
        <span style={{ opacity: 0.7 }}>スコア {score}</span>
      </div>
      <ul style={{ margin: "8px 0 0 18px" }}>
        {reasons.map((r, i) => (<li key={i}>{r}</li>))}
      </ul>
    </div>
  );
}

function ObservedCard({ v, th }: { v: UsedVars; th: Thresholds }) {
  const judgeColor = (ok: boolean, warn = false) => (ok ? "#137333" : warn ? "#8a6d00" : "#b00020");
  const pill = (text: string, ok: boolean, warn = false) => (
    <span style={{ color: judgeColor(ok, warn), background: ok ? "#e6f7e8" : warn ? "#fff6e5" : "#ffebee", border: `1px solid ${judgeColor(ok, warn)}`, borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
      {text}
    </span>
  );

  const windOk = v.wind_ms <= th.maxWindOk;
  const waveOk = v.wave_h_m <= th.maxWaveOk;
  const swellHOk = v.swell_h_m <= th.maxSwellOk;
  const swellTpOk = v.swell_tp_s >= th.minSwellTpOk;
  const rainOk = (v.rain_mmph ?? 0) <= th.rainWarn;
  const visOk = (v.visibility_km ?? 0) >= th.minVisibilityOk;

  const windWarn = v.wind_ms <= th.maxWindOk + 1.5 && !windOk;
  const waveWarn = v.wave_h_m <= th.maxWaveOk + 0.2 && !waveOk;
  const swellHWarn = v.swell_h_m <= th.maxSwellOk + 0.2 && !swellHOk;
  const swellTpWarn = v.swell_tp_s >= th.minSwellTpOk - 1 && !swellTpOk;
  const rainWarn = (v.rain_mmph ?? 0) <= th.rainWarn + 2 && !rainOk;
  const visWarn = (v.visibility_km ?? 0) >= th.minVisibilityOk - 0.5 && !visOk;

  const rows = [
    { k: "風速", val: `${(v.wind_ms ?? 0).toFixed(1)} m/s`, ok: windOk, warn: windWarn, tip: `OK ≤ ${th.maxWindOk} m/s` },
    { k: "波高", val: `${(v.wave_h_m ?? 0).toFixed(1)} m`, ok: waveOk, warn: waveWarn, tip: `OK ≤ ${th.maxWaveOk} m` },
    { k: "うねり高", val: `${(v.swell_h_m ?? 0).toFixed(1)} m`, ok: swellHOk, warn: swellHWarn, tip: `OK ≤ ${th.maxSwellOk} m` },
    { k: "うねり周期", val: `${(v.swell_tp_s ?? 0).toFixed(0)} s`, ok: swellTpOk, warn: swellTpWarn, tip: `OK ≥ ${th.minSwellTpOk} s` },
    { k: "降水", val: `${(v.rain_mmph ?? 0).toFixed(1)} mm/h`, ok: rainOk, warn: rainWarn, tip: `OK ≤ ${th.rainWarn} mm/h` },
    { k: "視程", val: `${(v.visibility_km ?? 0).toFixed(1)} km`, ok: visOk, warn: visWarn, tip: `OK ≥ ${th.minVisibilityOk} km` },
  ] as const;

  return (
    <div style={{ background: "#f7f9fb", border: "1px solid #dce3eb", borderRadius: 12, padding: 16, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>使用した実測値</strong>
        <small style={{ opacity: 0.7 }}>しきい値と比較して色分け表示</small>
      </div>

      <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "140px 1fr 1fr", rowGap: 8, columnGap: 12, alignItems: "center" }}>
        {rows.map((r) => (
          <React.Fragment key={r.k}>
            <div style={{ opacity: 0.8 }}>{r.k}</div>
            <div>{r.val}</div>
            <div title={r.tip}>
              {r.ok ? pill("OK", true) : r.warn ? pill("注意", false, true) : pill("NG", false)}
              <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>{r.tip}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
