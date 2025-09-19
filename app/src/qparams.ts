// src/qparams.ts
export type ParamState = {
  lat?: number; lon?: number; t?: string; preset?: string;
};

export function readParams(): ParamState {
  const p = new URLSearchParams(location.search);
  const lat = p.get("lat"); const lon = p.get("lon");
  const t = p.get("t") || undefined;
  const preset = p.get("preset") || undefined;
  return {
    lat: lat ? parseFloat(lat) : undefined,
    lon: lon ? parseFloat(lon) : undefined,
    t, preset
  };
}

export function writeParams(s: ParamState) {
  const p = new URLSearchParams();
  if (s.lat != null) p.set("lat", s.lat.toFixed(5));
  if (s.lon != null) p.set("lon", s.lon.toFixed(5));
  if (s.t) p.set("t", s.t);
  if (s.preset) p.set("preset", s.preset);
  history.replaceState(null, "", `?${p.toString()}`);
}
