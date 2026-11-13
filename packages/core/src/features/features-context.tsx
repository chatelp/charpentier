import { createContext, useContext } from 'react';
import type { Feature, TopZoneProps, WorkspaceProps } from './feature';
import './features.css';

/** The features active on this host, checked and with their texts installed. */
export const FeaturesContext = createContext<readonly Feature[]>([]);

export const useFeatures = () => useContext(FeaturesContext);

/** The features' bands at the top of the window, in their order. */
export function FeatureTopZones({ ctx }: TopZoneProps) {
  const zones = useFeatures().flatMap((f) => (f.topZone ? [{ id: f.id, ...f.topZone }] : []));
  if (zones.length === 0) return null;
  return (
    <div className="ch-top-zones">
      {zones.map(({ id, height, component: Zone }) => (
        <div key={id} className="ch-top-zone" data-feature={id} style={{ height }}>
          <Zone ctx={ctx} />
        </div>
      ))}
    </div>
  );
}

/** The features' states in the footer. */
export function FeatureFooterItems({ ctx }: WorkspaceProps) {
  const items = useFeatures().flatMap((f) => f.footer ?? []);
  return (
    <>
      {items.map(({ id, component: Item }) => (
        <Item key={id} ctx={ctx} />
      ))}
    </>
  );
}
