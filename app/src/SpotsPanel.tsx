import React, { useEffect, useMemo, useState } from "react";
import { distKm } from "./utils/geo";
import { postJudge } from "./http";
import type { Thresholds } from "./risk";
import allSpotsJson from "./spots.json";

export type Spot = { id: string; name: string; lat: number; lon: number };

export type JudgeResult = {
  label: "OK" | "注意" | "中止";
  score: number;
  reasons: string[];
};

type RowState = "idle" | "loading" | "ok" | "error";
type Row = {
  state: RowState;
  spot: Spot;
  distanceKm: number;
  result?: JudgeResult;
  error?: any;
  timeline?: JudgeResult["label"][];
};

type Props = {
  center: { lat: number; lon: number };
  atISO: string;
  th: Thresholds;
  limitKm?: number;
  spots?: Spot[];
  onStatuses?: (map: Record<string, JudgeResult["label"]>) => void;
  /** リストクリック時：App 側で focus state 更新 */
  onFocusSpot?: (lat: number, lon: number, id: string) => void;

  /** App から渡す「現在フォーカス中スポットの ID」 */
  focusedSpotId?: string;

  autoRun?: boolean;
  bandHours?: number;
  bandStepMin?: number;
};

function toLabel(s: string): JudgeResult["label"] {
  return s === "OK" || s === "注意" || s === "中止" ? s : "注意";
}

export default function SpotsPanel({
  center,
  atISO,
  th,
  limitKm = 50,
  spots,
  onStatuses,
  onFocusSpot,
  focusedSpotId,
  autoRun = true,
  bandHours = 6,
  bandStepMin = 60,
}: Props) {
  const cLat = center?.lat ?? 0;
  const cLon = center?.lon ?? 0;

  const list: Spot[] = useMemo(() => {
    const src = spots ?? (allSpotsJson as Spot[]);
    return src
      .map((s) => ({ ...s, _dist: distKm(cLat, cLon, s.lat, s.lon) }))
      .filter((s: any) => s._dist <= (limitKm ?? 50))
      .sort((a: any, b: any) => a._dist - b._dist)
      .map(({ _dist, ...rest }: any) => rest);
  }, [spots, cLat, cLon, limitKm]);

  const [rows, setRows] = useState<Row[]>([]);
  const [sortBy, setSortBy] = useState<"distance" | "score">("distance");

  useEffect(() => {
    const base: Row[] = (list || []).map((s) => ({
      spot: s,
      distanceKm: distKm(cLat, cLon, s.lat, s.lon),
      state: "idle",
    }));
    base.sort((a, b) => a.distanceKm - b.distanceKm);
    setRows(base);
  }, [list, cLat, cLon]);

  // 自動判定トリガ
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!autoRun || rows.length === 0) return;
    setTick((t) => t + 1);
  }, [autoRun, rows.length, cLat, cLon, atISO, th, limitKm, bandHours, bandStepMin]);

  useEffect(() => {
    if (!autoRun || rows.length === 0) return;
    judgeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  async function judgeAll() {
    const working: Row[] = rows.map((r) => ({ ...r, state: "loading" as const, error: undefined }));
    setRows(working);

    const statuses: Record<string, JudgeResult["label"]> = {};
    const CONCURRENCY = 5;
    const steps = Math.max(1, Math.floor((bandHours * 60) / bandStepMin));

    for (let i = 0; i < working.length; i += CONCURRENCY) {
      const slice = working.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map(async (r) => {
          try {
            const timeline: JudgeResult["label"][] = [];
            for (let j = 0; j < steps; j++) {
              const at = new Date(new Date(atISO).getTime() + j * bandStepMin * 60000).toISOString();
              const api = await postJudge({
                lat: r.spot.lat,
                lon: r.spot.lon,
                at,
                thresholds: th,
                save: false,
              });
              const jr: JudgeResult = {
                label: toLabel(api.result.label),
                score: api.result.score,
                reasons: api.result.reasons,
              };
              if (j === 0) {
                r.result = jr;
                statuses[r.spot.id] = jr.label;
              }
              timeline.push(jr.label);
            }
            r.timeline = timeline;
            r.state = "ok";
          } catch (e: any) {
            r.state = "error";
            r.error = String(e?.message || e);
          }
        })
      );
      setRows([...working]);
    }

    onStatuses?.(statuses);
  }

  const isRunning = rows.some((r) => r.state === "loading");

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortBy === "distance") copy.sort((a, b) => a.distanceKm - b.distanceKm);
    else copy.sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1));
    return copy;
  }, [rows, sortBy]);

  const top3 = useMemo(
    () =>
      [...rows]
        .filter((r) => r.result)
        .sort((a, b) => (b.result!.score ?? -1) - (a.result!.score ?? -1))
        .slice(0, 3),
    [rows]
  );

  const cardStyle = (active: boolean): React.CSSProperties =>
    active
      ? {
          border: "1px solid #93c5fd",
          background: "#eff6ff",
          boxShadow: "0 0 0 2px rgba(59,130,246,0.15) inset",
          borderRadius: 10,
          padding: "8px 10px",
        }
      : { border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 10px" };

  return (
    <section style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>周辺スポットの一括判定</h3>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          基準時刻: {new Date(atISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}・刻み: {bandStepMin}分・幅: {bandHours}時間
          {isRunning && <span style={{ marginLeft: 8 }}>（更新中…）</span>}
        </div>
        <div style={{ marginLeft: "auto", fontSize: 13 }}>
          並べ替え：
          <label style={{ marginLeft: 6 }}>
            <input type="radio" checked={sortBy === "distance"} onChange={() => setSortBy("distance")} />
            距離
          </label>
          <label style={{ marginLeft: 8 }}>
            <input type="radio" checked={sortBy === "score"} onChange={() => setSortBy("score")} />
            スコア
          </label>
        </div>
      </div>

      {/* ベスト3 */}
      <div style={{ marginTop: 12 }}>
        <strong style={{ fontSize: 13, opacity: 0.9 }}>この条件でのベスト3</strong>
        <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
          {top3.map((r) => {
            const active = r.spot.id === focusedSpotId;
            return (
              <button
                key={r.spot.id}
                onClick={() => onFocusSpot?.(r.spot.lat, r.spot.lon, r.spot.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "transparent",
                  textAlign: "left",
                  cursor: "pointer",
                  ...cardStyle(active),
                }}
                title="この地点を地図の中心へ"
              >
                <span style={{ fontWeight: 700 }}>{r.spot.name}</span>
                <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 4 }}>{r.distanceKm.toFixed(1)} km</span>
                <span style={{ marginLeft: "auto", fontSize: 12 }}>
                  <Badge label={r.result!.label} /> SCORE {r.result!.score}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 一覧 */}
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0" }}>
        {sorted.map((r) => {
          const isFocused = r.spot.id === focusedSpotId;
          return (
            <li
              key={r.spot.id}
              style={{
                borderTop: "1px solid #eee",
                padding: "10px 0",
                background: isFocused ? "#f5fbff" : undefined,
                borderLeft: isFocused ? "3px solid #0ea5e9" : "3px solid transparent",
              }}
            >
              <div
                onClick={() => onFocusSpot?.(r.spot.lat, r.spot.lon, r.spot.id)}
                style={{ fontWeight: 700, cursor: "pointer" }}
                title="この地点を地図の中心へ"
              >
                {r.spot.name}
                {isFocused && <span style={{ marginLeft: 8, color: "#0ea5e9" }}>（選択中）</span>}
                {!isFocused && <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 6 }}>(地図へ)</span>}
              </div>

              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {r.spot.lat.toFixed(3)}, {r.spot.lon.toFixed(3)}・距離 {r.distanceKm.toFixed(1)} km
              </div>

              {r.state === "idle" && <div style={{ fontSize: 13, opacity: 0.7 }}>未判定</div>}
              {r.state === "loading" && <Skeleton />}
              {r.state === "error" && <div style={{ fontSize: 13, color: "#b00020" }}>取得失敗…（自動で再取得されます）</div>}

              {r.state === "ok" && r.result && (
                <>
                  <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 13 }}>
                    <Badge label={r.result.label} />
                    <span> SCORE {r.result.score}</span>
                    <span style={{ opacity: 0.7 }}>・{r.result.reasons[0] ?? ""}</span>
                  </div>

                  {/* timeline 部分は元のまま */}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Skeleton() {
  return (
    <div
      style={{
        height: 16,
        width: 220,
        background: "linear-gradient(90deg,#eee 25%,#f5f5f5 37%,#eee 63%)",
        backgroundSize: "400% 100%",
        animation: "shimmer 1.2s linear infinite",
        borderRadius: 6,
        marginTop: 6,
      }}
    />
  );
}

function Badge({ label }: { label: "OK" | "注意" | "中止" }) {
  const fg = label === "OK" ? "#137333" : label === "注意" ? "#8a6d00" : "#b00020";
  const bg = label === "OK" ? "#e6f7e8" : label === "注意" ? "#fff6e5" : "#ffebee";
  return (
    <span
      style={{
        color: fg,
        background: bg,
        border: `1px solid ${fg}`,
        borderRadius: 999,
        padding: "2px 8px",
        fontWeight: 700,
        fontSize: 12,
      }}
    >
      {label}
    </span>
  );
}
