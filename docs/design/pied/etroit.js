// Mockup over the running app (DESIGN 1.45): the foot in a narrow window, and the posed line over
// the panels. Run once the panels are open; `window.PIED_POSER()` lifts the line that is showing.
(() => {
  const NEED = 400; // 25 rem: words 4.5, console 11, right side 7.5, two gaps
  const foot = document.querySelector('.ch-footer').getBoundingClientRect();
  let left = foot.left;
  let right = document.querySelector('.ch-mentor-panel') ? innerWidth - foot.right : 22;
  if (innerWidth - left - right < NEED) left = 22;
  if (innerWidth - left - right < NEED) right = 22;
  const s = document.createElement('style');
  s.textContent = `
  .ch-app .ch-footer{left:${left}px!important;right:${right}px!important}
  .ch-app[data-view='write'] .ch-footer{grid-template-columns:minmax(4.5rem,1fr) minmax(11rem,calc(min(30rem,38vw) + 6.5rem)) minmax(7.5rem,1fr)!important}
  .pied-over .ch-posed{box-shadow:0 2px 10px rgb(0 0 0 / 45%);text-align:left}
  @container (max-width:350px){.ch-posed-name{display:inline-block!important;max-width:12ch;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom;white-space:nowrap}}`;
  document.head.append(s);
  window.PIED_POSER = () => {
    const line = document.querySelector('.ch-footer-posed:not(.pied-over)');
    const at = document.querySelector('.ch-footer').getBoundingClientRect();
    const over = line.cloneNode(true);
    over.classList.add('ch-footer', 'pied-over');
    over.style.cssText = `position:fixed;z-index:9999;display:flex;font-size:12px;left:${at.left}px;right:${innerWidth - at.right}px;bottom:${innerHeight - at.top + 6}px`;
    line.style.visibility = 'hidden';
    document.querySelector('.ch-app').append(over);
  };
})();
