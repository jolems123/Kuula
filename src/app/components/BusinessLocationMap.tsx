import { UiText, uiText } from "../../i18n/ui-text";
import { useEffect, useRef, useState } from "react";
import { MapPin, Minus, Plus, LocateFixed } from "lucide-react";
import { pixelToPoint, pointToPixel, type LocationPoint } from "../lib/location";

/** Small slippy map: only visible OSM tiles, normal HTTP caching, no paid API. */
export function BusinessLocationMap({ point, onSelect }: { point: LocationPoint | null; onSelect: (point: LocationPoint) => void }) {
  const [center, setCenter] = useState<LocationPoint>(point ?? { latitude: 0.3476, longitude: 32.5825 });
  const [zoom, setZoom] = useState(point ? 17 : 12);
  const [width, setWidth] = useState(320);
  const [failed, setFailed] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; center: LocationPoint } | null>(null);
  useEffect(() => { if (point) { setCenter(point); setZoom(current => Math.max(current, 16)); } }, [point?.latitude, point?.longitude]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setFailed(false); }, [zoom, center.latitude, center.longitude]);
  const height = 280;
  const origin = pointToPixel(center, zoom);
  const marker = point ? pointToPixel(point, zoom) : null;
  const tileCount = 2 ** zoom;
  const tiles = [];
  for (let y = Math.floor((origin.y - height / 2) / 256); y <= Math.floor((origin.y + height / 2) / 256); y++) {
    if (y < 0 || y >= tileCount) continue;
    for (let x = Math.floor((origin.x - width / 2) / 256); x <= Math.floor((origin.x + width / 2) / 256); x++) {
      const tileX = ((x % tileCount) + tileCount) % tileCount;
      tiles.push(<img key={`${zoom}/${x}/${y}`} src={`https://tile.openstreetmap.org/${zoom}/${tileX}/${y}.png`} alt="" draggable={false} referrerPolicy="strict-origin-when-cross-origin" onError={() => setFailed(true)} style={{ position: "absolute", width: 256, height: 256, maxWidth: "none", left: x * 256 - origin.x + width / 2, top: y * 256 - origin.y + height / 2, pointerEvents: "none" }} />);
    }
  }
  const move = (dx: number, dy: number) => setCenter(pixelToPoint(origin.x + dx, origin.y + dy, zoom));
  return <div className="kx-business-map">
    <p className="kx-hint"><UiText text={"Drag to move the map, zoom in, then tap your business premises to place the pin. The starting map view is Kampala; it is not your captured location."} /></p>
    <div ref={viewport} className="kx-business-map__viewport" role="group" aria-label={uiText("Choose business location on map")} style={{ height }}
      onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, center }; event.currentTarget.setPointerCapture(event.pointerId); }}
      onPointerMove={event => { if (!drag.current) return; const start = pointToPixel(drag.current.center, zoom); setCenter(pixelToPoint(start.x - event.clientX + drag.current.x, start.y - event.clientY + drag.current.y, zoom)); }}
      onPointerCancel={() => { drag.current = null; }}
      onPointerUp={event => {
        const start = drag.current; drag.current = null;
        if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        onSelect(pixelToPoint(origin.x + event.clientX - bounds.left - width / 2, origin.y + event.clientY - bounds.top - height / 2, zoom));
      }}>
      {tiles}
      {marker && <MapPin aria-label={uiText("Business pin")} size={32} fill="#0b5e3a" color="white" style={{ position: "absolute", left: marker.x - origin.x + width / 2 - 16, top: marker.y - origin.y + height / 2 - 32, pointerEvents: "none", filter: "drop-shadow(0 1px 2px #333)" }} />}
      <a className="kx-business-map__attribution" onPointerDown={event => event.stopPropagation()} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"><UiText text={"© OpenStreetMap contributors"} /></a>
    </div>
    <div className="kx-business-map__controls">
      <button type="button" className="kx-btn kx-btn--secondary" aria-label={uiText("Zoom in map")} disabled={zoom >= 19} onClick={() => setZoom(z => z + 1)}><Plus size={16} /></button>
      <button type="button" className="kx-btn kx-btn--secondary" aria-label={uiText("Zoom out map")} disabled={zoom <= 3} onClick={() => setZoom(z => z - 1)}><Minus size={16} /></button>
      <button type="button" className="kx-btn kx-btn--secondary" onClick={() => onSelect(center)}><MapPin size={16} /><UiText text={"Place pin at map centre"} /></button>
      {point && <button type="button" className="kx-btn kx-btn--secondary" onClick={() => setCenter(point)}><LocateFixed size={16} /><UiText text={"Show my pin"} /></button>}
      <button type="button" className="kx-btn kx-btn--secondary" aria-label={uiText("Pan map north")} onClick={() => move(0, -100)}>↑</button>
      <button type="button" className="kx-btn kx-btn--secondary" aria-label={uiText("Pan map south")} onClick={() => move(0, 100)}>↓</button>
      <button type="button" className="kx-btn kx-btn--secondary" aria-label={uiText("Pan map west")} onClick={() => move(-100, 0)}>←</button>
      <button type="button" className="kx-btn kx-btn--secondary" aria-label={uiText("Pan map east")} onClick={() => move(100, 0)}>→</button>
    </div>
    {failed && <p role="status" className="kx-hint"><UiText text={"Some map images could not load. Check your internet connection. You can still use GPS or enter coordinates below."} /></p>}
  </div>;
}
