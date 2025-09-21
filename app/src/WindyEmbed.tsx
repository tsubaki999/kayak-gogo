import React, { useMemo } from "react";

type Props = {
  lat: number;                       // デフォルト中心
  lon: number;
  zoom?: number;                     // 非フォーカス時のズーム
  overlay?: "wind" | "waves" | "swell" | "rain" | "gust";
  height?: number | string;          // 例: 360 / "70vh" / "calc(70vh + 240px)"
  // リストから選択中スポット（ある場合は中心にしてマーカー表示＆ズームイン）
  focusLat?: number;
  focusLon?: number;
  focusZoom?: number;                // フォーカス時ズーム（既定 11）
};

export default function WindyEmbed({
  lat,
  lon,
  zoom = 9,
  overlay = "wind",
  height = "70vh",
  focusLat,
  focusLon,
  focusZoom = 11,
}: Props) {
  const cssHeight = typeof height === "number" ? `${height}px` : height ?? "70vh";

  // フォーカスがあればそちらを優先
  const centerLat = focusLat ?? lat;
  const centerLon = focusLon ?? lon;
  const marker = focusLat != null && focusLon != null;
  const usedZoom = marker ? Math.max(zoom, focusZoom) : zoom;

  const src = useMemo(() => {
    const u = new URL("https://embed.windy.com/embed2.html");
    const q = u.searchParams;
    q.set("lat", String(centerLat));
    q.set("lon", String(centerLon));
    q.set("zoom", String(usedZoom));
    q.set("level", "surface");
    q.set("overlay", overlay);
    q.set("menu", "");
    q.set("message", "true");
    q.set("marker", marker ? "true" : "false");
    q.set("calendar", "now");
    q.set("pressure", "true");
    q.set("type", "map");
    q.set("location", "coordinates");
    q.set("detail", "true");
    q.set("detailLat", String(centerLat));   // 予報バーも中心に合わせる
    q.set("detailLon", String(centerLon));
    q.set("metricWind", "default");
    q.set("metricTemp", "default");
    q.set("forecast", "1");
    q.set("product", "ecmwf");
    return u.toString();
  }, [centerLat, centerLon, usedZoom, overlay, marker]);

  return (
    <iframe
      key={src}               // パラメータ変更時に確実に再読込
      src={src}
      width="100%"
      height={cssHeight}
      style={{
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        minHeight: "600px",   // ← ★ 地図エリアを必ず確保
        display: "block",     // ← ★ 確実にブロック描画
      }}
      frameBorder="0"
      title="windy-forecast"
    />
  );
}
