import type { Thresholds } from "./risk";

/** Cloud Functions ベースURL（.env で上書き可） */
const RAW_BASE =
  import.meta.env.VITE_API_BASE ||
  "http://localhost:5001/kayak-gogo/asia-northeast1";

/** 末尾スラッシュを削って正規化 */
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

/* ---------------- Types ---------------- */

export type PostJudgeInput = {
  // 自動取得モード（推奨）
  lat?: number;
  lon?: number;
  at?: string;            // ISO: new Date(time).toISOString()
  presetId?: string;
  thresholds?: Partial<Thresholds>;
  save?: boolean;

  // 明示値送信（手動・テスト用）
  vars?: {
    wind?: number; wave?: number; swellH?: number; swellTp?: number;
    wind_ms?: number; wave_h_m?: number; swell_h_m?: number; swell_tp_s?: number;
    rain?: number; rain_mmph?: number; visibility?: number; visibility_km?: number;
    thunder?: boolean; advisory?: any;
  };
};

export type UsedVars = {
  wind_ms: number;
  wave_h_m: number;
  swell_h_m: number;
  swell_tp_s: number;
  rain_mmph: number;
  visibility_km: number;
  thunder?: boolean;
  advisory?: any | null;
};

export type PostJudgeResponse = {
  ok: boolean;
  result: { label: string; score: number; reasons: string[] };
  usedVars?: UsedVars;
};

/* ---------------- Fetcher ---------------- */

function withTimeout(ms: number) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, clear: () => clearTimeout(id) };
}

/**
 * 判定API呼び出し
 * - サーバーモード: {lat, lon, at, presetId, thresholds, save} を渡せば OK
 * - 手動/テスト: body.vars に値を入れても可
 */
export async function postJudge(
  body: PostJudgeInput,
  { timeoutMs = 15000 }: { timeoutMs?: number } = {}
): Promise<PostJudgeResponse> {
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/judgeApi`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal,
    });

    // 失敗時は本文(JSON か text)を拾って投げ直す
    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = j?.error ? `: ${j.error}` : "";
      } catch {
        detail = `: ${await res.text()}`;
      }
      throw new Error(`judgeApi ${res.status}${detail}`);
    }

    const json = (await res.json()) as PostJudgeResponse;
    return json;
  } finally {
    clear();
  }
}
