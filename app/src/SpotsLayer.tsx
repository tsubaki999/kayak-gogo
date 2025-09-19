// app/src/SpotsLayer.tsx
import React from "react";
import { Marker } from "react-leaflet";
import L from "leaflet";
import type { Spot } from "./SpotsPanel";

type Props = {
  spots: Spot[];
  onSelect?: (lat: number, lon: number) => void;
  statuses?: Record<string, "OK" | "注意" | "中止">;
};

const icon = L.icon({
  iconUrl: "/marker-icon.png",
  iconRetinaUrl: "/marker-icon-2x.png",
  shadowUrl: "/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function SpotsLayer({ spots = [], onSelect, statuses = {} }: Props) {
  return (
    <>
      {spots.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lon]}
          icon={icon}
          eventHandlers={{ click: () => onSelect?.(s.lat, s.lon) }}
        >
          {/* react-leaflet v4 では Popup/Tooltip 非推奨変更があるので簡易に */}
          <div title={`${s.name} (${statuses[s.id] ?? "未判定"})`} />
        </Marker>
      ))}
    </>
  );
}
