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
type TimeCell = { tISO: string; label: JudgeResult["label"]; score: number };

type Row = {
  state: RowState;
  spot: Spot;
  distanceKm: number;
  result?: JudgeResult;   // “今”の判定
  band?: TimeCell[];      // ミニタイムライン（今→先の時刻）
  error?: any;
};

type Props = {
  center: { lat: number; lon: number };
  atISO: string;
  th: Thresholds;
  limitKm?: number;
  spots?: Spot[];
  onStatuses?: (map: Record<string, JudgeResult["label"]>) => void;
  // ▼ 追加オプション（必要なら App から上書き可）
  autoRun?: boolean;      // 初回に自動判定するか（既定 true）
  bandHours?: number;     // 予報帯の時間幅（h, 既定 6h）
  bandStepMin?: number;   // サンプリング間隔（分, 既定 60m）
  spotConcurrency?: number; // 同時スポット数（既定 4）
};

// 文字列labelを安全に Union 型へ変換
function toLabel(s: string): JudgeResult["label"] {
  return s === "OK" || s === "注意" || s === "中止" ? s : "注意";
}

// 連続OKの最大長（ステップ数）を返す
function longestOkStreak(cells: TimeCell[] = []): number {
  let best = 0, cur = 0;
  for (const c of cells) {
    if (c.label === "OK") { cur++; best = Math.max(best, cur); }
    else { cur = 0; }
  }
  return best;
}

// 最初にOKになるまでの待ち時間（ステップ数, 見つからなければ Infinity）
function waitStepsToFirstOk(cells: TimeCell[] = []): number {
  const idx = cells.findIndex(c => c.label === "OK");
  return idx < 0 ? Number.POSITIVE_INFINITY : idx;
}

export default function SpotsPanel({
  center,
  atISO,
  th,
  limitKm = 50,
  spots,
  onStatuses,
  autoRun = true,
  bandHours = 6,
  bandStepMin = 60,
  spotConcurrency = 4,
}: Props) {
  const cLat = center?.lat ?? 0;
  const cLon = center?.lon ?? 0;

  // 対象スポットの抽出＆距離順
  const list: Spot[] = useMemo(() => {
    const src = spots ?? (allSpotsJson as Spot[]);
    return src
      .map(s => ({ ...s, _dist: distKm(cLat, cLon, s.lat, s.lon) }))
      .filter((s: any) => s._dist <= (limitKm ?? 50))
      .sort((a: any, b: any) => a._dist - b._dist)
      .map(({ _dist, ...rest }: any) => rest);
  }, [spots, cLat, cLon, limitKm]);

  // 行データ
  const [rows, setRows] = useState<Row[]>([]);
  const [sortBy, setSortBy] = useState<"distance" | "score">("distance");
  const [top3, setTop3] = useState<Row[]>([]);

  // ベース行の作成
  useEffect(() => {
    const base: Row[] = (list || []).map((s) => ({
      spot: s,
      distanceKm: distKm(cLat, cLon, s.lat, s.lon),
      state: "idle",
    }));
    base.sort((a, b) => a.distanceKm - b.distanceKm);
    setRows(base);
  }, [list, cLat, cLon]);

  // 初回に自動実行
  useEffect(() => {
    if (autoRun && rows.length) {
      void judgeAll(); // fire & forget
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, rows.length]);

  // 判定実行（ミニタイムラインも併せて取得）
  async function judgeAll() {
    if (!rows.length) return;

    const steps = Math.max(1, Math.floor((bandHours * 60) / bandStepMin) + 1); // 今を含む
    const stepMs = bandStepMin * 60 * 1000;
    const t0 = new Date(atISO).getTime();

    const working: Row[] = rows.map((r) => ({
      ...r,
      state: "loading" as const,
      error: undefined,
    }));
    setRows(working);

    const statuses: Record<string, JudgeResult["label"]> = {};

    // スポット単位の並列（spotConcurrency）
    for (let i = 0; i < working.length; i += spotConcurrency) {
      const slice = working.slice(i, i + spotConcurrency);

      await Promise.all(
        slice.map(async (r) => {
          try {
            const band: TimeCell[] = [];
            for (let k = 0; k < steps; k++) {
              const tISO = new Date(t0 + k * stepMs).toISOString();
              const api = await postJudge({
                lat: r.spot.lat,
                lon: r.spot.lon,
                at: tISO,
                thresholds: th,
                save: false,
              });
              band.push({
                tISO,
                label: toLabel(api.result.label as any),
                score: Number(api.result.score || 0),
              });
            }

            // 今（先頭）の結果
            const nowCell = band[0];
            const jr: JudgeResult = {
              label: nowCell.label,
              score: nowCell.score,
              reasons: [], // 必要なら先頭レスポンスの reasons を保持可能
            };

            r.state = "ok";
            r.result = jr;
            r.band = band;
            statuses[r.spot.id] = jr.label;
          } catch (e: any) {
            r.state = "error";
            r.error = String(e?.message || e);
          }
        })
      );

      setRows([...working]); // バッチ描画
    }

    onStatuses?.(statuses);

    // Top3 抽出
    const ranked = rankRows(working, { bandStepMin });
    setTop3(ranked.slice(0, 3));
  }

  // 単発リトライ
  async function retryOne(idx: number) {
    const clone = [...rows];
    if (!clone[idx]) return;

    const steps = Math.max(1, Math.floor((bandHours * 60) / bandStepMin) + 1);
    const stepMs = bandStepMin * 60 * 1000;
    const t0 = new Date(atISO).getTime();

    clone[idx] = { ...clone[idx], state: "loading" as const, error: undefined };
    setRows(clone);

    try {
      const band: TimeCell[] = [];
      for (let k = 0; k < steps; k++) {
        const tISO = new Date(t0 + k * stepMs).toISOString();
        const api = await postJudge({
          lat: clone[idx].spot.lat,
          lon: clone[idx].spot.lon,
          at: tISO,
          thresholds: th,
          save: false,
        });
        band.push({
          tISO,
          label: toLabel(api.result.label as any),
          score: Number(api.result.score || 0),
        });
      }
      const nowCell = band[0];
      clone[idx] = {
        ...clone[idx],
        state: "ok",
        result: { label: nowCell.label, score: nowCell.score, reasons: [] },
        band,
      };
      setRows(clone);
    } catch (e: any) {
      clone[idx] = { ...clone[idx], state: "error", error: String(e?.message || e) };
      setRows(clone);
    }
  }

  // 並べ替え
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
      {/* Top3 ピン留め */}
      {top3.length > 0 && (
        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            padding: 12,
            background: "#f8fafc",
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>今日行くなら（Top3）</div>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            {top3.map((r, i) => {
              const bestOk = longestOkStreak(r.band) * (r.band ? 1 : 0);
              const wait = waitStepsToFirstOk(r.band);
              return (
                <li key={r.spot.id} style={{ marginBottom: 6 }}>
                  <span style={{ fontWeight: 700 }}>{r.spot.name}</span>{" "}
                  <Badge label={r.result!.label} />{" "}
                  <span style={{ opacity: 0.75 }}>
                    / 距離 {r.distanceKm.toFixed(1)}km・SCORE {r.result!.score}
                    {Number.isFinite(wait) ? `・${wait}ステップ後OK` : ""}
                    {bestOk > 1 ? `・連続OK ${bestOk}ステップ` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* ヘッダー操作 */}
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
            スコア（現時点）
          </label>
        </div>
      </div>

      {/* リスト */}
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
              <div style={{ fontWeight: 700 }}>
                {r.spot.name}{" "}
                {r.state === "ok" && r.result && <Badge label={r.result.label} />}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {r.spot.lat.toFixed(3)}, {r.spot.lon.toFixed(3)}・距離{" "}
                {r.distanceKm.toFixed(1)} km
              </div>

              {/* ステータス */}
              {r.state === "idle" && (
                <div style={{ fontSize: 13, opacity: 0.7 }}>未判定</div>
              )}
              {r.state === "loading" && <Skeleton />}
              {r.state === "error" && (
                <div style={{ fontSize: 13, color: "#b00020" }}>
                  取得失敗… <button onClick={() => retryOne(idx)}>↻ リトライ</button>
                </div>
              )}

              {/* ミニタイムライン帯 */}
              {r.state === "ok" && r.band && (
                <MiniBand band={r.band} stepMin={bandStepMin} />
              )}

              {/* スコア+理由の先頭だけ軽く */}
              {r.state === "ok" && r.result && (
                <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 13 }}>
                  <span>SCORE {r.result.score}</span>
                  <span style={{ opacity: 0.7 }}>
                    ・{r.result.reasons?.[0] ?? ""}
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

// ===== 小さなUI部品 =====

function Skeleton() {
  return (
    <div
      style={{
        height: 16,
        width: 240,
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
        marginLeft: 6,
      }}
    >
      {label}
    </span>
  );
}

function MiniBand({ band, stepMin }: { band: TimeCell[]; stepMin: number }) {
  const box = (c: TimeCell, i: number) => {
    const bg =
      c.label === "OK" ? "#22c55e" : c.label === "注意" ? "#f59e0b" : "#ef4444";
    const title = `${new Date(c.tISO).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} / ${c.label} / SCORE ${c.score}`;
    return (
      <div
        key={i}
        title={title}
        style={{
          width: 14,
          height: 10,
          borderRadius: 2,
          background: bg,
          opacity: 0.9,
        }}
      />
    );
  };
  return (
    <div style={{ display: "flex", gap: 3, marginTop: 8, alignItems: "center" }}>
      <div style={{ fontSize: 11, opacity: 0.65, width: 42 }}>
        {new Date(band[0].tISO).toLocaleTimeString([], { hour: "2-digit" })}
      </div>
      <div style={{ display: "flex", gap: 3 }}>{band.map(box)}</div>
      <div style={{ fontSize: 11, opacity: 0.65, marginLeft: 6 }}>
        +{stepMin}m × {band.length - 1}
      </div>
    </div>
  );
}

// ===== ランキング =====

function rankRows(rows: Row[], opts: { bandStepMin: number }): Row[] {
  const { bandStepMin } = opts;
  // スコア化：平均スコア・連続OK長・待ち時間・距離のバランス
  function rankScore(r: Row): number {
    if (r.state !== "ok" || !r.result) return -9999;

    const avg =
      r.band && r.band.length
        ? r.band.reduce((s, c) => s + (c.score || 0), 0) / r.band.length
        : r.result.score;

    const okStreak = longestOkStreak(r.band); // ステップ数
    const okStreakMin = okStreak * bandStepMin;

    const waitSteps = waitStepsToFirstOk(r.band);
    const waitMin = Number.isFinite(waitSteps) ? waitSteps * bandStepMin : 9999;

    // 重みは控えめ（あとで調整可）
    return (
      avg * 1.0 +                 // 基本は平均スコア
      okStreakMin * 0.08 -        // 連続OKを少し加点
      r.distanceKm * 1.2 -        // 距離ペナルティ
      waitMin * 0.05              // 待ち時間ペナルティ
    );
  }

  return [...rows]
    .filter((r) => r.state === "ok")
    .sort((a, b) => rankScore(b) - rankScore(a));
}
