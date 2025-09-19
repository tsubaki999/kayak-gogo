// app/src/SpotsPanel.tsx
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
};

type Props = {
  center: { lat: number; lon: number };
  atISO: string;
  th: Thresholds;
  limitKm?: number;
  spots?: Spot[];
  onStatuses?: (map: Record<string, JudgeResult["label"]>) => void;
};

// 文字列labelを安全に Union 型へ変換
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
}: Props) {
  // ★ center をプリミティブに分解
  const cLat = center?.lat ?? 0;
  const cLon = center?.lon ?? 0;

  const list: Spot[] = useMemo(() => {
    const src = spots ?? (allSpotsJson as Spot[]);
    return src
      .map((s) => ({
        ...s,
        _dist: distKm(cLat, cLon, s.lat, s.lon),
      }))
      .filter((s: any) => s._dist <= (limitKm ?? 50))
      .sort((a: any, b: any) => a._dist - b._dist)
      .map(({ _dist, ...rest }: any) => rest);
  }, [spots, cLat, cLon, limitKm]);

  const [rows, setRows] = useState<Row[]>([]);
  const [sortBy, setSortBy] = useState<"distance" | "score">("distance");

  // 初期行作成 useEffect
  useEffect(() => {
    const base: Row[] = (list || []).map((s) => ({
      spot: s,
      distanceKm: distKm(cLat, cLon, s.lat, s.lon),
      state: "idle",
    }));
    base.sort((a, b) => a.distanceKm - b.distanceKm);
    setRows(base);
  }, [list, cLat, cLon]);

  async function judgeAll() {
    const working: Row[] = rows.map((r) => ({
      ...r,
      state: "loading" as const,
      error: undefined,
    }));
    setRows(working);

    const statuses: Record<string, JudgeResult["label"]> = {};
    const CONCURRENCY = 5;

    for (let i = 0; i < working.length; i += CONCURRENCY) {
      const slice = working.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map(async (r) => {
          try {
            const api = await postJudge({
              lat: r.spot.lat,
              lon: r.spot.lon,
              at: atISO,
              thresholds: th,
              save: false,
            });
            const jr: JudgeResult = {
              label: toLabel(api.result.label),
              score: api.result.score,
              reasons: api.result.reasons,
            };
            r.state = "ok";
            r.result = jr;
            statuses[r.spot.id] = jr.label;
          } catch (e: any) {
            r.state = "error";
            r.error = String(e?.message || e);
          }
        })
      );
      setRows([...working]); // バッチごとに描画
    }

    onStatuses?.(statuses);
  }

  async function retryOne(idx: number) {
    const clone = [...rows];
    if (!clone[idx]) return;
    clone[idx] = { ...clone[idx], state: "loading" as const, error: undefined };
    setRows(clone);
    try {
      const api = await postJudge({
        lat: clone[idx].spot.lat,
        lon: clone[idx].spot.lon,
        at: atISO,
        thresholds: th,
        save: false,
      });
      const jr: JudgeResult = {
        label: toLabel(api.result.label),
        score: api.result.score,
        reasons: api.result.reasons,
      };
      clone[idx] = { ...clone[idx], state: "ok", result: jr };
      setRows(clone);
    } catch (e: any) {
      clone[idx] = {
        ...clone[idx],
        state: "error",
        error: String(e?.message || e),
      };
      setRows(clone);
    }
  }

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sortBy === "distance") {
      copy.sort((a, b) => a.distanceKm - b.distanceKm);
    } else {
      copy.sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1));
    }
    return copy;
  }, [rows, sortBy]);

  return (
    <section style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>周辺スポットの一括判定</h3>
        <button onClick={judgeAll} style={{ marginLeft: 8 }}>
          この周辺で判定（{rows.length}件）
        </button>
        <div style={{ marginLeft: "auto", fontSize: 13 }}>
          並べ替え：
          <label style={{ marginLeft: 6 }}>
            <input
              type="radio"
              checked={sortBy === "distance"}
              onChange={() => setSortBy("distance")}
            />
            距離
          </label>
          <label style={{ marginLeft: 8 }}>
            <input
              type="radio"
              checked={sortBy === "score"}
              onChange={() => setSortBy("score")}
            />
            スコア
          </label>
        </div>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0" }}>
        {sorted.map((r, idx) => (
          <li
            key={r.spot.id}
            style={{
              borderTop: "1px solid #eee",
              padding: "10px 0",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{r.spot.name}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {r.spot.lat.toFixed(3)}, {r.spot.lon.toFixed(3)}・距離{" "}
                {r.distanceKm.toFixed(1)} km
              </div>

              {r.state === "idle" && (
                <div style={{ fontSize: 13, opacity: 0.7 }}>未判定</div>
              )}
              {r.state === "loading" && <Skeleton />}
              {r.state === "error" && (
                <div style={{ fontSize: 13, color: "#b00020" }}>
                  取得失敗…{" "}
                  <button onClick={() => retryOne(idx)}>↻ リトライ</button>
                </div>
              )}
              {r.state === "ok" && r.result && (
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    marginTop: 4,
                    fontSize: 13,
                  }}
                >
                  <Badge label={r.result.label} />
                  <span> SCORE {r.result.score}</span>
                  <span style={{ opacity: 0.7 }}>
                    ・{r.result.reasons[0] ?? ""}
                  </span>
                </div>
              )}
            </div>
          </li>
        ))}
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
        background:
          "linear-gradient(90deg,#eee 25%,#f5f5f5 37%,#eee 63%)",
        backgroundSize: "400% 100%",
        animation: "shimmer 1.2s linear infinite",
        borderRadius: 6,
        marginTop: 6,
      }}
    />
  );
}

function Badge({ label }: { label: "OK" | "注意" | "中止" }) {
  const fg =
    label === "OK" ? "#137333" : label === "注意" ? "#8a6d00" : "#b00020";
  const bg =
    label === "OK" ? "#e6f7e8" : label === "注意" ? "#fff6e5" : "#ffebee";
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
