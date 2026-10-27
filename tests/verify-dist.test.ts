import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyDist } from '../scripts/verify-dist.ts';

const seo = (lang: 'ja' | 'en', origin: string) => {
  const path = lang === 'ja' ? '/' : '/en/';
  const meta = (key: string, v: string) => `<meta property="${key}" content="${v}">`;
  return (
    `<link rel="canonical" href="https://izu-san.com${path}">` +
    `<link rel="alternate" hreflang="ja" href="https://izu-san.com/"><link rel="alternate" hreflang="en" href="https://izu-san.com/en/">` +
    `<link rel="alternate" hreflang="x-default" href="https://izu-san.com/">` +
    ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:locale', 'og:image:alt'].map((k) => meta(k, 'x')).join('') +
    meta('og:url', origin + path) + meta('og:image', `${origin}/og/${lang}.png`) +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<script type="application/ld+json">{"@type":"Person"}</script>'
  );
};

const page = (lang: string, { link = lang === 'ja' ? '/en/' : '/', robots = '', extra = '', origin = 'https://izu-san.com' } = {}) =>
  `<!doctype html><html lang="${lang}"><head>${robots}${seo(lang as 'ja' | 'en', origin)}<link rel="stylesheet" href="/_astro/a.css"></head>` +
  `<body><a href="${link}">switch</a><a href="#profile">p</a><section id="profile"></section>` +
  `<section id="works"></section>${extra}</body></html>`;

const PROD_ROBOTS = 'User-agent: *\nAllow: /\n\nSitemap: https://izu-san.com/sitemap.xml\n';
const PROD_SITEMAP = '<urlset><url><loc>https://izu-san.com/</loc></url><url><loc>https://izu-san.com/en/</loc></url></urlset>';

function build(opts: { ja?: string; en?: string; robots?: string; sitemap?: string } = {}) {
  const dist = mkdtempSync(join(tmpdir(), 'dist-'));
  mkdirSync(join(dist, 'en'));
  mkdirSync(join(dist, '_astro'));
  writeFileSync(join(dist, '_astro/a.css'), 'a{}');
  writeFileSync(join(dist, 'index.html'), opts.ja ?? page('ja'));
  writeFileSync(join(dist, 'en/index.html'), opts.en ?? page('en'));
  mkdirSync(join(dist, 'og'));
  for (const f of ['og/ja.png', 'og/en.png', 'favicon.svg', 'apple-touch-icon.png']) writeFileSync(join(dist, f), 'x');
  writeFileSync(join(dist, 'robots.txt'), opts.robots ?? PROD_ROBOTS);
  writeFileSync(join(dist, 'sitemap.xml'), opts.sitemap ?? PROD_SITEMAP);
  writeFileSync(join(dist, '404.html'), '<html><head><meta name="robots" content="noindex"></head></html>');
  return dist;
}

const noindex = '<meta name="robots" content="noindex, nofollow">';
const beacon = '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>';

test('正しい本番ビルドは合格する', () => {
  assert.deepEqual(verifyDist(build(), 'production'), []);
});

test('正しいプレビューのビルドは合格する', () => {
  const pv = 'https://preview.izu-san.com';
  const dist = build({
    ja: page('ja', { robots: noindex, origin: pv }),
    en: page('en', { robots: noindex, origin: pv }),
    robots: 'User-agent: *\nDisallow: /\n',
    sitemap: '<urlset></urlset>',
  });
  assert.deepEqual(verifyDist(dist, 'preview'), []);
});

test('本番に noindex があると失敗する', () => {
  const dist = build({ ja: page('ja', { robots: noindex }) });
  assert.match(verifyDist(dist, 'production').join('\n'), /本番なのに noindex/);
});

test('プレビューに noindex がない・解析タグがあると失敗する', () => {
  const errors = verifyDist(build({ ja: page('ja', { extra: beacon }) }), 'preview').join('\n');
  assert.match(errors, /プレビューなのに noindex/);
  assert.match(errors, /プレビューに解析タグ/);
});

test('ページ内リンクの行き先がないと失敗する', () => {
  const dist = build({ ja: page('ja', { extra: '<a href="#missing">x</a>' }) });
  assert.match(verifyDist(dist, 'production').join('\n'), /#missing の行き先がない/);
});

test('参照するファイルが dist にないと失敗する', () => {
  const dist = build({ ja: page('ja', { extra: '<img src="/_astro/none.png">' }) });
  assert.match(verifyDist(dist, 'production').join('\n'), /none\.png が dist にない/);
});

test('日英でセクション ID が違うと失敗する', () => {
  const dist = build({ en: page('en').replace('id="works"', 'id="projects"') });
  assert.match(verifyDist(dist, 'production').join('\n'), /セクション ID が違う/);
});

test('日英切り替えのリンクがないと失敗する', () => {
  const dist = build({ ja: page('ja', { link: '/other/' }) });
  assert.match(verifyDist(dist, 'production').join('\n'), /切り替えリンクがない/);
});

test('http のリンクは失敗する', () => {
  const dist = build({ ja: page('ja', { extra: '<a href="http://example.com">x</a>' }) });
  assert.match(verifyDist(dist, 'production').join('\n'), /https か mailto/);
});

test('本番の robots.txt が全面拒否・サイトマップが空だと失敗する', () => {
  const errors = verifyDist(build({ robots: 'User-agent: *\nDisallow: /\n', sitemap: '<urlset></urlset>' }), 'production').join('\n');
  assert.match(errors, /全面拒否/);
  assert.match(errors, /Sitemap がない/);
  assert.match(errors, /sitemap\.xml: https:\/\/izu-san\.com\/ がない/);
});

test('プレビューの robots.txt・サイトマップが本番用だと失敗する', () => {
  const pv = 'https://preview.izu-san.com';
  const dist = build({ ja: page('ja', { robots: noindex, origin: pv }), en: page('en', { robots: noindex, origin: pv }) });
  const errors = verifyDist(dist, 'preview').join('\n');
  assert.match(errors, /全面拒否でない/);
  assert.match(errors, /サイトマップに URL/);
});

test('OGP の欠落・canonical の誤り・JSON-LD のメールアドレスを検出する', () => {
  const broken = page('ja').replace('<meta property="og:image:alt" content="x">', '').replace('canonical" href="https://izu-san.com/"', 'canonical" href="https://example.com/"');
  const errors = verifyDist(build({ ja: broken }), 'production').join('\n');
  assert.match(errors, /og:image:alt がない/);
  assert.match(errors, /canonical が正しくない/);
  const mail = page('en').replace('{"@type":"Person"}', '{"email":"mailto:a@b.c"}');
  assert.match(verifyDist(build({ en: mail }), 'production').join('\n'), /JSON-LD にメールアドレス/);
});
