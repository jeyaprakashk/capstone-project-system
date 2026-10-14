// AvatarColor: constant, accessible colours per person (algorithm in avatar-color.js).
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const c = vm.createContext({});
vm.runInContext(fs.readFileSync('avatar-color.js', 'utf8'), c);
const avatars = c.avatarColorBrowser_();

test('the same seed always gives the same colours, ignoring case and spaces', () => {
  assert.equal(avatars.style('Ann@Example.com '), avatars.style('ann@example.com'));
});

test('the hue is the sum of the character codes modulo 360', () => {
  assert.equal(avatars.colors('ab').hue, (97 + 98) % 360);
  assert.equal(avatars.colors('').hue, 0);
});

test('every hue reaches a 4.6:1 contrast with its text colour', () => {
  const lum = rgb => { const [r, g, b] = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const hslToRgb = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return [0, 8, 4].map(n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))); };
  for (let hue = 0; hue < 360; hue++) {
    const seed = String.fromCharCode(hue === 0 ? 360 : hue);
    const col = avatars.colors(seed);
    const bg = lum(hslToRgb(col.hue, 70, col.lightness));
    const fg = col.color === '#ffffff' ? 1 : lum([30, 41, 59]);
    assert.ok((Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) >= 4.55, 'hue ' + col.hue);
  }
});

test('style is a plain background and text colour declaration', () => {
  assert.match(avatars.style('a@b.c'), /^background-color:hsl\(\d+,70%,\d+%\);color:#(ffffff|1e293b)$/);
});
