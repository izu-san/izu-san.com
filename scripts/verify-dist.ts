// ビルド結果（dist/）の主要表示を検証する。公開の前に、AWS の権限なしで実行する（仕様書 §9.2 手順 4）。
// 使い方: node scripts/verify-dist.ts <dist> <production|preview>
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SiteEnv = 'production' | 'preview';

const PAGES = { ja: 'index.html', en: 'en/index.html' } as const;
const ANALYTICS_HOST = 'static.cloudflareinsights.com';

const metaContent = (html: string, key: 'name' | 'property', value: string) =>
  new RegExp(`<meta ${key}="${value}" content="([^"]*)"`).exec(html)?.[1];

const attrs = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'g'))].map((m) => m[1]);

/** dist/ を検証し、問題の一覧を返す（空なら合格）。 */
export function verifyDist(dist: string, env: SiteEnv): string[] {
  const errors: string[] = [];
  const read = (rel: string) => {
    const file = join(dist, rel);
    if (!existsSync(file)) {
      errors.push(`${rel} がない`);
      return '';
    }
    return readFileSync(file, 'utf8');
  };

  const pages = { ja: read(PAGES.ja), en: read(PAGES.en) };
  const notFound = read('404.html');
  if (notFound && !/<meta name="robots" content="[^"]*noindex/.test(notFound)) {
    errors.push('404.html に noindex がない');
  }

  const sectionIds: Record<string, string[]> = {};
  for (const lang of ['ja', 'en'] as const) {
    const html = pages[lang];
    if (!html) continue;
    const ids = new Set(attrs(html, 'id'));
    sectionIds[lang] = [...ids].filter((id) => !id.endsWith('-h')).sort();

    // ページ内リンクの行き先がある。
    for (const href of attrs(html, 'href').filter((h) => h.startsWith('#'))) {
      if (href.length > 1 && !ids.has(href.slice(1))) errors.push(`${PAGES[lang]}: ${href} の行き先がない`);
    }
    // 参照する内部ファイル（CSS・画像・フォント）が dist にある。
    for (const ref of [...attrs(html, 'href'), ...attrs(html, 'src')]) {
      if (!ref.startsWith('/') || ref.startsWith('//')) continue;
      const path = ref.split(/[?#]/)[0];
      const file = path.endsWith('/') ? join(path, 'index.html') : path;
      if (!existsSync(join(dist, file))) errors.push(`${PAGES[lang]}: ${ref} が dist にない`);
    }
    // 外部リンクは https か mailto だけ。
    for (const href of attrs(html, 'href').filter((h) => /^[a-z][a-z0-9+.-]*:/i.test(h))) {
      if (!/^(https:|mailto:)/i.test(href)) errors.push(`${PAGES[lang]}: ${href} は https か mailto にする`);
    }
  }

  // 日英切り替えは通常のリンク。互いのページへ向く。
  if (pages.ja && !attrs(pages.ja, 'href').includes('/en/')) errors.push('日本語版に英語版への切り替えリンクがない');
  if (pages.en && !attrs(pages.en, 'href').includes('/')) errors.push('英語版に日本語版への切り替えリンクがない');
  if (pages.ja && pages.en && sectionIds.ja.join() !== sectionIds.en.join()) {
    errors.push(`日英でセクション ID が違う（ja: ${sectionIds.ja.join(',')} / en: ${sectionIds.en.join(',')}）`);
  }
  if (pages.ja && !/<html lang="ja"/.test(pages.ja)) errors.push('日本語版の lang が ja でない');
  if (pages.en && !/<html lang="en"/.test(pages.en)) errors.push('英語版の lang が en でない');

  // 環境ごとの出し分け: プレビューは noindex・解析タグなし。本番は noindex を出さない。
  for (const lang of ['ja', 'en'] as const) {
    const html = pages[lang];
    if (!html) continue;
    const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
    if (env === 'preview' && !noindex) errors.push(`${PAGES[lang]}: プレビューなのに noindex がない`);
    if (env === 'production' && noindex) errors.push(`${PAGES[lang]}: 本番なのに noindex がある`);
    if (env === 'preview' && html.includes(ANALYTICS_HOST)) errors.push(`${PAGES[lang]}: プレビューに解析タグがある`);
  }
  if (env === 'preview' && notFound.includes(ANALYTICS_HOST)) errors.push('404.html: プレビューに解析タグがある');

  verifySeo(dist, env, pages, read, errors);
  return errors;
}

/** 検索・共有まわり（OGP、canonical、hreflang、robots.txt、sitemap.xml）を検証する（ZJS-12）。 */
function verifySeo(
  dist: string,
  env: SiteEnv,
  pages: Record<'ja' | 'en', string>,
  read: (rel: string) => string,
  errors: string[],
) {
  const origin = env === 'production' ? 'https://izu-san.com' : 'https://preview.izu-san.com';
  for (const lang of ['ja', 'en'] as const) {
    const html = pages[lang];
    if (!html) continue;
    const page = PAGES[lang];
    const path = lang === 'ja' ? '/' : '/en/';
    // 本番の canonical・hreflang は、本番の URL を指す（プレビューの canonical も本番を指す。noindex なので無害）。
    if (!html.includes(`<link rel="canonical" href="https://izu-san.com${path}">`)) errors.push(`${page}: canonical が正しくない`);
    for (const [hreflang, href] of [['ja', '/'], ['en', '/en/'], ['x-default', '/']]) {
      if (!html.includes(`hreflang="${hreflang}" href="https://izu-san.com${href}"`)) errors.push(`${page}: hreflang=${hreflang} が正しくない`);
    }
    for (const key of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:locale', 'og:image', 'og:image:alt', 'og:url']) {
      if (!metaContent(html, 'property', key)) errors.push(`${page}: ${key} がない`);
    }
    if (metaContent(html, 'property', 'og:url') !== `${origin}${path}`) errors.push(`${page}: og:url が環境の URL でない`);
    if (metaContent(html, 'name', 'twitter:card') !== 'summary_large_image') errors.push(`${page}: twitter:card が summary_large_image でない`);
    const image = metaContent(html, 'property', 'og:image') ?? '';
    if (image !== `${origin}/og/${lang}.png`) errors.push(`${page}: og:image が環境の /og/${lang}.png でない`);
    if (!existsSync(join(dist, `og/${lang}.png`))) errors.push(`og/${lang}.png がない`);
    if (!/<script type="application\/ld\+json">/.test(html)) errors.push(`${page}: JSON-LD がない`);
    // 個人情報（メールアドレス）を構造化データに入れない。
    const ld = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html)?.[1] ?? '';
    if (/mailto:|[\w.+-]+@[\w-]+\.[\w.]+/.test(ld)) errors.push(`${page}: JSON-LD にメールアドレスがある`);
  }
  for (const file of ['favicon.svg', 'apple-touch-icon.png']) {
    if (!existsSync(join(dist, file))) errors.push(`${file} がない`);
  }

  const robots = read('robots.txt');
  const sitemap = read('sitemap.xml');
  if (env === 'production') {
    if (/^Disallow:\s*\/\s*$/m.test(robots)) errors.push('robots.txt: 本番なのに全面拒否している');
    if (!robots.includes('Sitemap: https://izu-san.com/sitemap.xml')) errors.push('robots.txt: 本番の Sitemap がない');
    for (const loc of ['https://izu-san.com/', 'https://izu-san.com/en/']) {
      if (!sitemap.includes(`<loc>${loc}</loc>`)) errors.push(`sitemap.xml: ${loc} がない`);
    }
  } else {
    if (!/^Disallow:\s*\/\s*$/m.test(robots)) errors.push('robots.txt: プレビューが全面拒否でない');
    if (/Sitemap:/i.test(robots) || sitemap.includes('<loc>')) errors.push('プレビューのサイトマップに URL がある');
  }
}

/** dist/ 配下のファイルを、dist からの相対パス（/ 区切り）で列挙する。 */
export function listFiles(dist: string, dir = ''): string[] {
  return readdirSync(join(dist, dir)).flatMap((name) => {
    const rel = dir ? `${dir}/${name}` : name;
    return statSync(join(dist, rel)).isDirectory() ? listFiles(dist, rel) : [rel];
  });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const [dist, env] = process.argv.slice(2);
  if (!dist || (env !== 'production' && env !== 'preview')) {
    console.error('使い方: node scripts/verify-dist.ts <dist> <production|preview>');
    process.exit(2);
  }
  const errors = verifyDist(resolve(dist), env);
  if (errors.length > 0) {
    for (const e of errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  console.log(`dist の検証に合格した（${env}、${listFiles(resolve(dist)).length} ファイル）`);
}
