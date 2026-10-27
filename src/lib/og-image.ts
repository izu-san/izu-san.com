// 共有画像（1200×630）をビルド時に生成する。製図風・琥珀色 1 色で、名前と一言を載せる（仕様書 §7.1 の配色）。
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';

export const OG_SIZE = { width: 1200, height: 630 } as const;

const COLORS = { bg: '#0e1114', text: '#e6e9ec', muted: '#9ba5ae', line: '#2b333a', accent: '#f2a93b' };

const require = createRequire(import.meta.url);

interface Subset {
  file: string;
  ranges: [number, number][];
}

/** fontsource の CSS から、サブセットごとの unicode-range を読む。 */
function subsets(pkg: string, css: string): Subset[] {
  const root = dirname(require.resolve(`${pkg}/package.json`));
  const source = readFileSync(join(root, css), 'utf8');
  return [...source.matchAll(/url\(\.\/files\/([^)]+?\.woff)\)[^;]*;\s*unicode-range:\s*([^;]+);/g)].map((m) => ({
    file: join(root, 'files', m[1]),
    ranges: m[2].split(',').map((r) => {
      const [from, to = from] = r.trim().replace(/^U\+/i, '').split('-');
      return [parseInt(from, 16), parseInt(to, 16)];
    }),
  }));
}

/**
 * 文字列に必要なサブセットだけを、satori のフォントとして読む。
 * 同名で複数渡すと後のものが使われないため、サブセットごとに別名にし、family の一覧（`family`）で字ごとに使い分ける。
 */
function fontsFor(name: string, weight: 400 | 700, pkg: string, css: string, text: string) {
  const all = subsets(pkg, css);
  const needed = new Set<Subset>();
  for (const ch of new Set(text)) {
    const cp = ch.codePointAt(0)!;
    const hit = all.find((s) => s.ranges.some(([a, b]) => cp >= a && cp <= b));
    if (!hit) throw new Error(`${name} に「${ch}」の字形がありません`);
    needed.add(hit);
  }
  const fonts = [...needed].map((s, i) => ({ name: `${name} ${i}`, data: readFileSync(s.file), weight, style: 'normal' as const }));
  return { fonts, family: fonts.map((f) => `'${f.name}'`).join(', ') };
}

const box = (style: Record<string, unknown>, children?: unknown) => ({
  type: 'div',
  props: { style: { display: 'flex', ...style }, children },
});
const label = (family: string, text: string, extra: Record<string, unknown> = {}) =>
  box({ fontFamily: family, fontWeight: 700, fontSize: 22, letterSpacing: 4, color: COLORS.muted, ...extra }, text);

export interface OgInput {
  name: string;
  headline: string;
  /** 右上の小さなラベル（例: PORTFOLIO）。 */
  tag: string;
}

/** 製図の表題欄のように、枠・コーナーマーク・ラベルで構成した共有画像を PNG で返す。 */
export async function renderOgImage({ name, headline, tag }: OgInput): Promise<Buffer> {
  const { width, height } = OG_SIZE;
  const fixed = 'DWG-001 REV A SCALE 1:1 SHEET 1/1 IZU-SAN.COM';
  const dela = fontsFor('Dela Gothic One', 400, '@fontsource/dela-gothic-one', 'index.css', name);
  const zen = fontsFor('Zen Kaku Gothic New', 700, '@fontsource/zen-kaku-gothic-new', '700.css', headline + tag + fixed);
  const fonts = [...dela.fonts, ...zen.fonts];

  const corner = (pos: Record<string, number | undefined>) =>
    box({ position: 'absolute', width: 36, height: 36, borderColor: COLORS.accent, borderStyle: 'solid', borderWidth: 0, ...pos });
  const cornerStyles = [
    { top: 40, left: 40, borderTopWidth: 4, borderLeftWidth: 4 },
    { top: 40, right: 40, borderTopWidth: 4, borderRightWidth: 4 },
    { bottom: 40, left: 40, borderBottomWidth: 4, borderLeftWidth: 4 },
    { bottom: 40, right: 40, borderBottomWidth: 4, borderRightWidth: 4 },
  ].map(corner);

  const tree = box(
    { position: 'relative', width, height, background: COLORS.bg },
    [
      ...cornerStyles,
      box({ position: 'absolute', top: 72, left: 72, right: 72, bottom: 72, flexDirection: 'column', justifyContent: 'space-between' }, [
      box({ justifyContent: 'space-between', alignItems: 'center' }, [label(zen.family, tag, { color: COLORS.accent }), label(zen.family, 'DWG-001 / REV A')]),
      box({ flexDirection: 'column' }, [
        box({ width: 96, height: 6, background: COLORS.accent, marginBottom: 36 }),
        box({ fontFamily: dela.family, fontSize: 120, lineHeight: 1.1, color: COLORS.text }, name),
        box(
          { fontFamily: zen.family, fontWeight: 700, fontSize: 38, lineHeight: 1.5, color: COLORS.text, marginTop: 28, maxWidth: 980 },
          headline,
        ),
      ]),
      box({ borderTop: `2px solid ${COLORS.line}`, paddingTop: 20, justifyContent: 'space-between' }, [
        label(zen.family, 'SCALE 1:1 / SHEET 1/1'),
        label(zen.family, 'IZU-SAN.COM'),
      ]),
      ]),
    ],
  );

  const svg = await satori(tree as never, { width, height, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
}
