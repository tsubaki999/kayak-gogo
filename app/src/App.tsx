// app/src/App.tsx
import React, { useEffect, useState } from "react";
import { Thresholds } from "./risk";
import { ensurePresets, loadPresets } from "./fs";
import { readParams, writeParams } from "./qparams";
import WindyEmbed from "./WindyEmbed";
import SpotsPanel from "./SpotsPanel";

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
  const [time, setTime] = useState(start.t ?? new Date().toISOString().slice(0, 16)); // yyyy-mm-ddThh:mm
  const [presets, setPresets] = useState<PresetDoc[]>([]);
  const [presetId, setPresetId] = useState(start.preset ?? "inner-bay");

  // ▼ しきい値
  const [th, setTh] = useState(DEFAULT_TH);

  // ▼ Windy 表示レイヤー
  const [overlay, setOverlay] = useState<"wind" | "waves" | "rain" | "swell" | "gust">("wind");

  // ▼ SpotsPanel を条件変更で自動再実行させるための key
  const [spotsKey, setSpotsKey] = useState("");

  // ▼ マーカー色分けなどで使う判定まとめ（将来用）
  type StatusLabel = "OK" | "注意" | "中止";
  type StatusMap = Record<string, StatusLabel>;
  const [spotStatuses, setSpotStatuses] = useState({} as StatusMap);

  // ▼ UI 折りたたみ
  const [showThresholds, setShowThresholds] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // ▼ リストで選んだスポット（Windy の中心）
  const [focus, setFocus] = useState<{ lat: number; lon: number } | null>(null);
  // ▼ リストで選んだスポットの ID（ハイライト用）
  const [focusedSpotId, setFocusedSpotId] = useState<string | null>(null);

  // プリセット投入＆取得
  useEffect(() => {
    ensurePresets()
      .then(loadPresets)
      .then((ps) => setPresets(ps as PresetDoc[]))
      .catch(() => {});
  }, []);

  // プリセット変更時にしきい値を上書き
  useEffect(() => {
    const p = presets.find((pp) => pp.id === presetId);
    if (p) setTh(p.thresholds);
  }, [presetId, presets]);

  // URL 同期
  useEffect(() => {
    writeParams({ lat, lon, t: time, preset: presetId });
  }, [lat, lon, time, presetId]);

  // SpotsPanel を再マウントして自動再判定
  useEffect(() => {
    const key = [
      lat.toFixed(4),
      lon.toFixed(4),
      new Date(time).toISOString(),
      presetId,
      th.maxWindOk,
      th.maxWaveOk,
      th.maxSwellOk,
      th.minSwellTpOk,
      th.rainWarn,
      th.minVisibilityOk,
    ].join("|");
    setSpotsKey(key);
  }, [lat, lon, time, presetId, th]);

  return (
    <main style={{ padding: 16, maxWidth: "min(1200px, 95vw)", margin: "0 auto" }}>
      <h1>出艇判断チェッカー</h1>

      {/* Windy を常時表示（一本化） */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <div style={{ marginLeft: "auto" }}>
          <label style={{ fontSize: 13, opacity: 0.9, marginRight: 8 }}>Windy表示:</label>
          <select value={overlay} onChange={(e) => setOverlay(e.target.value as any)}>
            <option value="wind">風（ベクトル）</option>
            <option value="waves">波浪</option>
            <option value="swell">うねり</option>
            <option value="rain">降水</option>
            <option value="gust">ガスト</option>
          </select>
        </div>
      </div>

      {/* Windy 本体 */}
      <WindyEmbed
        lat={lat}
        lon={lon}
        zoom={9}
        overlay={overlay}
        height="calc(70vh + 240px)"
        focusLat={focus?.lat}
        focusLon={focus?.lon}
        focusZoom={11}
      />

      {/* 日時 + 詳細設定 */}
      <div style={{ display: "grid", gap: 12, margin: "12px 0" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, opacity: 0.7 }}>日時</label>
          <input
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            style={{
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#f8f8f8",
              cursor: "pointer",
            }}
          >
            {showDetails ? "詳細設定を閉じる ▲" : "詳細設定（緯度・経度 ほか）を開く ▼"}
          </button>
        </div>

        {showDetails && (
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.7 }}>緯度</label>
              <input
                value={lat.toFixed(5)}
                onChange={(e) => setLat(parseFloat(e.target.value || "0"))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: "block", fontSize: 12, opacity: 0.7 }}>経度</label>
              <input
                value={lon.toFixed(5)}
                onChange={(e) => setLon(parseFloat(e.target.value || "0"))}
                style={{ width: "100%" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* プリセット */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* しきい値（折りたたみ） */}
      {showThresholds && (
        <section style={{ marginTop: 16 }}>
          {/* スライダー群（元のまま） */}
        </section>
      )}

      {/* 周辺スポットの一括判定 */}
      <section style={{ marginTop: 12 }}>
        <SpotsPanel
          key={spotsKey}
          center={{ lat, lon }}
          atISO={new Date(time).toISOString()}
          th={th}
          limitKm={50}
          onStatuses={(m) => setSpotStatuses(m)}
          autoRun={true}
          bandHours={6}
          bandStepMin={60}
          focusedSpotId={focusedSpotId ?? undefined}
          onFocusSpot={(fLat, fLon, id) => {
            setFocus({ lat: fLat, lon: fLon });
            setFocusedSpotId(id);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </section>
    </main>
  );
}
