/* Maquette : trois rendus de « allumé » (là où l'auteur est), DESIGN principe 3 et §4.7.
   À injecter dans l'app : window.LUMIERE = { variante } ; variante = « teinte » (la lueur
   abandonnée : une teinte plate, plus claire que la matière) ou « retro » (la lumière retravaillée :
   rétroéclairée de l'intérieur, rien ne déborde). Sans variante : la lueur actuelle. */
(() => {
  const v = (window.LUMIERE || {}).variante;
  if (!v) return;
  const css = document.createElement('style');
  if (v === 'teinte') {
    css.textContent = `
      :root { --ch-lit: 0 0 #0000 !important; --ch-lit-bg: color-mix(in srgb, var(--ch-bg) 40%, #fff) !important; }
      .ch-tool, .ch-tool * { --ch-lit-bg: color-mix(in srgb, var(--ch-bg) 90%, #fff) !important; }
      .ch-system, .ch-system * { --ch-lit-bg: color-mix(in srgb, var(--ch-bg) 88%, #fff) !important; }
      @media (prefers-color-scheme: dark) { :root { --ch-lit-bg: color-mix(in srgb, var(--ch-bg) 90%, #fff) !important; } }
    `;
  } else if (v === 'retro') {
    css.textContent = `
      :root {
        --ch-lit: inset 0 1px 0 rgb(255 255 255 / 0.9), inset 0 14px 16px -12px rgb(255 255 255 / 0.8) !important;
        --ch-lit-bg: color-mix(in srgb, var(--ch-bg) 55%, #fff) !important;
      }
      .ch-tool, .ch-tool *, .ch-system, .ch-system * {
        --ch-lit: inset 0 1px 0 rgb(255 255 255 / 0.13), inset 0 16px 18px -12px rgb(255 255 255 / 0.1) !important;
        --ch-lit-bg: color-mix(in srgb, var(--ch-bg) 94%, #fff) !important;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --ch-lit: inset 0 1px 0 rgb(255 255 255 / 0.1), inset 0 16px 18px -12px rgb(255 255 255 / 0.08) !important;
          --ch-lit-bg: color-mix(in srgb, var(--ch-bg) 93%, #fff) !important;
        }
      }
    `;
  }
  document.head.appendChild(css);
})();
