declare module "react-leaflet" {
  // 型の厳密さは後で整えるとして、まずビルドを通すため any に
  export const MapContainer: any;
  export const TileLayer: any;
  export const Marker: any;
}
