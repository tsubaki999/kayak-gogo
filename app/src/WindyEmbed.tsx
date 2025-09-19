import React, { useMemo } from "react";

type Props = {
  lat: number;
  lon: number;
  zoom?: number;
  overlay?: "wind" | "waves" | "rain" | "swell" | "gust";
  height?: number; // px
};

export default function WindyEmbed({
  lat,
  lon,
  zoom = 9,
  overlay = "wind",
  height = 320,
}: Props) {
  // Windyの埋め込みURL
  // ドキュメント: https://www.windy.com/embedding
  const src = useMemo(() => {
    const params = new URLSearchParams({
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
      zoom: String(zoom),
      overlay,
      // 使いやすいオプション色々（表示UIなど）
      level: "surface",
      menu: "true",
      message: "true",
      marker: `${lat.toFixed(4)},${lon.toFixed(4)}`,
      calendar: "now",
      pressure: "true",
      type: "map",
      location: "coordinates",
      detail: "true",
      detailLat: lat.toFixed(4),
      detailLon: lon.toFixed(4),
      metricWind: "m/s",
      metricTemp: "°C",
      metricRain: "mm",
      metricWaves: "m",
    });
    return `https://embed.windy.com/embed2.html?${params.toString()}`;
  }, [lat, lon, zoom, overlay]);

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #dce3eb" }}>
      <iframe
        title="Windy Forecast"
        width="100%"
        height={height}
        src={src}
        frameBorder="0"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
