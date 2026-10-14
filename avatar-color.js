/**
 * AVATAR COLOR — browser module serialized into the dashboard shell as `AvatarColor`.
 * A constant colour pair for one person: the hue comes from the seed (the lower-cased name, falling back to the
 * register number or email), saturation is fixed at 70%, and the lightness
 * moves in steps of 2 until the text colour (white or dark slate) reaches a 4.6:1 contrast, a margin
 * over the WCAG AA 4.5:1 minimum. The same seed always gives the same colours.
 * `style(seed)` returns the value of a `style` attribute: the colour is computed per person, so it
 * cannot be a Tailwind utility. It returns text only and never touches the DOM or the server.
 */
function avatarColorBrowser_() {
  'use strict';
  const SATURATION = 70, MIN_CONTRAST = 4.6, LIGHT_TEXT = '#ffffff', DARK_TEXT = '#1e293b';
  const LIGHT_LUMINANCE = 1, DARK_LUMINANCE = luminance([30, 41, 59]);

  function rgbFromHsl(hue, saturation, lightness) {
    const s = saturation / 100, l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const second = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const sector = Math.floor(hue / 60) % 6;
    const [r, g, b] = [[chroma, second, 0], [second, chroma, 0], [0, chroma, second], [0, second, chroma], [second, 0, chroma], [chroma, 0, second]][sector];
    const shift = l - chroma / 2;
    return [r, g, b].map(v => Math.round((v + shift) * 255));
  }
  function luminance(rgb) {
    const [r, g, b] = rgb.map(v => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  /** {hue, lightness, color} for a seed. */
  function colors(seed) {
    const text = String(seed ?? '').trim().toLowerCase();
    let hue = 0;
    for (let i = 0; i < text.length; i++) hue = (hue + text.charCodeAt(i)) % 360;
    let lightness = 50;
    for (let pass = 0; pass < 50; pass++) {
      const bg = luminance(rgbFromHsl(hue, SATURATION, lightness));
      const withLight = contrast(LIGHT_LUMINANCE, bg), withDark = contrast(DARK_LUMINANCE, bg);
      const useLight = withLight >= withDark;
      if (Math.max(withLight, withDark) >= MIN_CONTRAST) return {hue, lightness, color: useLight ? LIGHT_TEXT : DARK_TEXT};
      lightness += useLight ? -2 : 2;
    }
    return {hue, lightness, color: lightness < 50 ? LIGHT_TEXT : DARK_TEXT};
  }
  function style(seed) {
    const c = colors(seed);
    return 'background-color:hsl(' + c.hue + ',' + SATURATION + '%,' + c.lightness + '%);color:' + c.color;
  }
  return {colors, style};
}
