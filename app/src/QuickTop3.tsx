// app/src/QuickTop3.tsx
import React, { useMemo, useState } from "react";
import spotsJson from "./spots.json";
import { distKm } from "./utils/geo";
import { postJudge } from "./http";
import type { Thresholds } from "./risk";

type Spot = { id: string; name: string; lat: number; lon: number };
type JudgeResult = { label: "OK" | "注意" | "中止"; score: number; reasons: string[] };

type Props = {
  center: { lat: number; lon: number };
  atISO: string;         // 判定する日時
  th: Thresholds;        // しきい値
  limitKm?: number;      // 近傍検索の半径
  pool?: number;         // 何件を候補として判定するか（上位3件を表示）
  onJump?: (lat: number, lon: number) => void; // 選択したスポットへ移動
};

export default function QuickTop3({
  center,
  atISO,
  th,
  limitKm = 60,
  pool = 12,
  onJump,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Array<{ spot: Spot; result: JudgeResult }>>([]);

  const list = useMemo(() => {
    const all = spotsJson as Spot[];
    const withDist = all.map(s => ({
      ...s,
      _dist: distKm(center.lat, center.lon, s.lat, s.lon),
    }));
    return withDist
      .filter((s: any) => s._dist <= limitKm)
      .sort((a: any, b: any) => a._dist - b._dist)
      .slice(0, pool)
      .map(({ _dist, ...rest }: any) => rest) as Spot[];
  }, [center.lat, center.lon, limitKm, pool]);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const out: Array<{ spot: Spot; result: JudgeResult }> = [];
      // ほどほどに並列
      const CONC = 5;
      for (let i = 0; i < list.length; i += CONC) {
        const batch = list.slice(i, i + CONC).map(async (s) => {
          const api = await postJudge({
            lat: s.lat,
            lon: s.lon,
            at: atISO,
            thresholds: th,
            save: false,
          });
          const label = (api.result.label === "OK" || api.result.label === "注意" || api.result.label === "中止")
            ? api.result.label
            : "注意";
          out.push({ spot: s, result: { label, score: api.result.score, reasons: api.result.reasons } });
        });
        await Promise.all(batch);
      }
      out.sort((a, b) => b.result.score - a.result.score);
      setRows(out.slice(0, 3));
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  const Badge: React.FC<{ label: JudgeResult["label"] }> = ({ label }) => {
    const fg = label === "OK" ? "#137333" : label === "注意" ? "#8a6d00" : "#b00020";
    const bg = label === "OK" ? "#e6f7e8" : label === "注意" ? "#fff6e5" : "#ffebee";
    return (
      <span style={{ color: fg, background: bg, border: `1px solid ${fg}`, borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>
        {label}
      </span>
    );
  };

  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        background: "#fafbfc",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong>この周辺のベスト3（{limitKm}km）</strong>
        <button
          onClick={run}
          disabled={busy}
          style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: busy ? "#f3f4f6" : "white" }}
        >
          {busy ? "判定中..." : "更新"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto" }}>
        {rows.length === 0 && !busy && (
          <div style={{ fontSize: 13, opacity: 0.7 }}>「更新」を押して判定します</div>
        )}
        {rows.map(({ spot, result }) => (
          <button
            key={spot.id}
            onClick={() => onJump?.(spot.lat, spot.lon)}
            style={{
              minWidth: 180,
              padding: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              borderRadius: 10,
              textAlign: "left",
              cursor: "pointer",
            }}
            title={result.reasons[0] ?? ""}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                {spot.name}
              </div>
              <Badge label={result.label} />
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              SCORE {result.score}・{(distKm(center.lat, center.lon, spot.lat, spot.lon)).toFixed(1)} km
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
