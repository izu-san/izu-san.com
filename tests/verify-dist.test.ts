import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyDist } from '../scripts/verify-dist.ts';

const page = (lang: string, { link = lang === 'ja' ? '/en/' : '/', robots = '', extra = '' } = {}) =>
  `<!doctype html><html lang="${lang}"><head>${robots}<link rel="stylesheet" href="/_astro/a.css"></head>` +
  `<body><a href="${link}">switch</a><a href="#profile">p</a><section id="profile"></section>` +
  `<section id="works"></section>${extra}</body></html>`;

function build(opts: { ja?: string; en?: string } = {}) {
  const dist = mkdtempSync(join(tmpdir(), 'dist-'));
  mkdirSync(join(dist, 'en'));
  mkdirSync(join(dist, '_astro'));
  writeFileSync(join(dist, '_astro/a.css'), 'a{}');
  writeFileSync(join(dist, 'index.html'), opts.ja ?? page('ja'));
  writeFileSync(join(dist, 'en/index.html'), opts.en ?? page('en'));
  writeFileSync(join(dist, '404.html'), '<html><head><meta name="robots" content="noindex"></head></html>');
  return dist;
}

const noindex = '<meta name="robots" content="noindex, nofollow">';
const beacon = '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>';

test('正しい本番ビルドは合格する', () => {
  assert.deepEqual(verifyDist(build(), 'production'), []);
});

test('正しいプレビューのビルドは合格する', () => {
  const dist = build({ ja: page('ja', { robots: noindex }), en: page('en', { robots: noindex }) });
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
