import React from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";

type Props = {
  lat: number;
  lon: number;
  onPick?: (lat: number, lon: number) => void;
  setLat?: (v: number) => void;
  setLon?: (v: number) => void;
  children?: React.ReactNode;
};

export default function MapPicker({
  lat,
  lon,
  onPick,
  setLat,
  setLon,
  children,
}: Props) {
  const center: [number, number] = [lat, lon];

  const handleAttach = (map: LeafletMap) => {
    map.on("click", (e: any) => {
      const la = e.latlng.lat as number;
      const lo = e.latlng.lng as number;
      onPick?.(la, lo);
      setLat?.(la);
      setLon?.(lo);
    });
  };

  return (
    <div style={{ height: 260, width: "100%" }}>
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
        whenCreated={handleAttach}  // ← こちらでクリックをフック
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {/* 外から差し込むレイヤー（候補地点マーカー群など） */}
        {children}

        {/* 現在位置ピン（App.tsxでデフォルトアイコン差し替え済み） */}
        <Marker position={center} />
      </MapContainer>
    </div>
  );
}
