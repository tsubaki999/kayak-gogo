// app/src/fs.ts
// Firestore を使わず、ローカル (localStorage) 実装に切り替え

import type { Thresholds } from "./risk";

type PresetDoc = { id: string; name: string; thresholds: Thresholds };

// デフォルトプリセット
const DEFAULT_PRESETS: PresetDoc[] = [
  {
    id: "inner-bay",
    name: "内湾ライト",
    thresholds: {
      maxWindOk: 6,
      maxWaveOk: 1.0,
      maxSwellOk: 1.2,
      minSwellTpOk: 9,
      rainWarn: 4,
      minVisibilityOk: 2,
    },
  },
  {
    id: "outer-moderate",
    name: "外洋控えめ",
    thresholds: {
      maxWindOk: 5,
      maxWaveOk: 0.8,
      maxSwellOk: 1.0,
      minSwellTpOk: 10,
      rainWarn: 3,
      minVisibilityOk: 3,
    },
  },
  {
    id: "expert",
    name: "ベテラン",
    thresholds: {
      maxWindOk: 7,
      maxWaveOk: 1.2,
      maxSwellOk: 1.4,
      minSwellTpOk: 8,
      rainWarn: 5,
      minVisibilityOk: 2,
    },
  },
];

const LS_KEY = "kayak-presets";

// 初期投入（存在しないときだけ）
export async function ensurePresets() {
  const exists = localStorage.getItem(LS_KEY);
  if (!exists) {
    localStorage.setItem(LS_KEY, JSON.stringify(DEFAULT_PRESETS));
  }
}

// 読み込み
export async function loadPresets(): Promise<PresetDoc[]> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as PresetDoc[]) : DEFAULT_PRESETS;
  } catch {
    return DEFAULT_PRESETS;
  }
}

// ログ保存は no-op（Functions 側で Firestore 保存しているため）
export async function saveLog(
  _presetId: string,
  _lat: number,
  _lon: number,
  _at: string,
  _result: { label: string; score: number; reasons: string[] }
) {
  // 何もしない
  return;
}
