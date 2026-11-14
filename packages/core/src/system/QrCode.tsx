import { encode } from 'uqr';

/**
 * A QR code drawn in the page's ink (phase 5.13): one path, a quiet zone of
 * two modules, sharp at any size.
 */
export function QrCode({ value, label }: { readonly value: string; readonly label: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 2 });
  let path = '';
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      className="ch-qr"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} className="ch-qr-ground" />
      <path d={path} className="ch-qr-ink" />
    </svg>
  );
}

/** `WIFI:T:WPA;S:…;P:…;;`, what a phone's camera reads to join a network. */
export function wifiCode(ssid: string, password: string): string {
  const escape = (s: string) => s.replace(/([\\;,:"])/g, '\\$1');
  return `WIFI:T:WPA;S:${escape(ssid)};P:${escape(password)};;`;
}
