import { z } from 'astro/zod';

// 空欄・未定義を許さない文字列。日英で同じ表記（固有の作品名など）は許可する。
export const text = z
  .string({ error: '未定義です' })
  .trim()
  .min(1, { error: '空欄です' });

export const bilingual = z.strictObject({ ja: text, en: text });

const order = z.number().int().positive();
const year = z.string().regex(/^\d{4}$/, { error: 'YYYY 形式で指定してください' });

// 関心領域の「次トークン候補」。word は interests のいずれかと一致させる。確率の合計は 1 以下。
const tokenCandidate = z.strictObject({ text, p: z.number().gt(0).lte(1) });
const tokenAnnotation = z.strictObject({ word: text, candidates: z.array(tokenCandidate).min(2) });

// プロフィール: src/content/profile/{ja,en}.md（本文は Markdown）
export const profileSchema = z
  .strictObject({
    name: text,
    headline: text,
    pageTitle: text,
    description: text,
    avatarAlt: text,
    interests: z.array(text).min(1),
    tokens: z.array(tokenAnnotation).optional(),
  })
  .superRefine((profile, ctx) => {
    const words = new Set<string>();
    profile.tokens?.forEach((token, i) => {
      if (!profile.interests.includes(token.word)) {
        ctx.addIssue({ code: 'custom', path: ['tokens', i, 'word'], message: 'interests にない語です' });
      }
      if (words.has(token.word)) {
        ctx.addIssue({ code: 'custom', path: ['tokens', i, 'word'], message: '語が重複しています' });
      }
      words.add(token.word);
      const total = token.candidates.reduce((sum, c) => sum + c.p, 0);
      if (total > 1 + 1e-9) {
        ctx.addIssue({ code: 'custom', path: ['tokens', i, 'candidates'], message: '確率の合計が 1 を超えています' });
      }
    });
  });

// 作品: src/content/works/<作品ID>.yaml。日英を 1 ファイルに持たせ、作品 ID の食い違いを構造上起こさない。
// 個別ページ（公開 URL のない作品だけが持つ。ZJS-20）。導入と、節（本文・要点・構成図）の並びで書く。
const detailPoint = z.strictObject({ label: text, text });
const diagramNode = z.strictObject({ name: text, note: text.optional() });
const diagramRow = z.strictObject({ label: text, nodes: z.array(diagramNode).min(1) });
const detailDiagram = z.strictObject({ caption: text, rows: z.array(diagramRow).min(2) });
const detailSection = z
  .strictObject({
    heading: text,
    body: z.array(text).min(1).optional(),
    points: z.array(detailPoint).min(1).optional(),
    diagram: detailDiagram.optional(),
  })
  .refine((section) => section.body || section.points || section.diagram, { error: '本文・要点・構成図のいずれかが必要です' });
const workDetail = z.strictObject({ lead: text, sections: z.array(detailSection).min(1) });

const workCopy = z.strictObject({
  name: text,
  summary: text,
  imageAlt: text.optional(),
  // 画像の出典（第三者の素材を使うとき）。リンクは任意。
  imageCredit: z.strictObject({ text, link: z.strictObject({ label: text, url: z.httpUrl() }).optional() }).optional(),
  detail: workDetail.optional(),
});

type WorkDetail = z.infer<typeof workDetail>;

/** 日英で節・要点・構成図の数が揃っているかを見るための形。内容の一致は、プレビュー確認で判断する。 */
const detailShape = (detail: WorkDetail) =>
  JSON.stringify(
    detail.sections.map((s) => [s.body?.length ?? 0, s.points?.length ?? 0, s.diagram?.rows.map((r) => r.nodes.length) ?? null]),
  );

export const createWorkSchema = (image: z.ZodType) =>
  z
    .strictObject({
      order,
      tech: z.array(text).min(1),
      url: z.httpUrl().optional(),
      image: image.optional(),
      ja: workCopy,
      en: workCopy,
    })
    .superRefine((work, ctx) => {
      if (work.ja.detail && work.en.detail && detailShape(work.ja.detail) !== detailShape(work.en.detail)) {
        ctx.addIssue({ code: 'custom', path: ['en', 'detail'], message: '日英で節・本文・要点・構成図の数が揃っていません' });
      }
      for (const lang of ['ja', 'en'] as const) {
        if (work[lang].imageCredit && !work.image) {
          ctx.addIssue({ code: 'custom', path: [lang, 'imageCredit'], message: '画像がないのに出典があります' });
        }
        if (work.image && !work[lang].imageAlt) {
          ctx.addIssue({ code: 'custom', path: [lang, 'imageAlt'], message: '画像があるときは代替テキストが必須です' });
        }
        // 個別ページは公開 URL のない作品に限る。URL があるなら外部へ、無ければ個別ページへつなぐ。
        if (!work.url && !work[lang].detail) {
          ctx.addIssue({ code: 'custom', path: [lang, 'detail'], message: 'URL がない作品は個別ページの本文（detail）が必須です' });
        }
        if (work.url && work[lang].detail) {
          ctx.addIssue({ code: 'custom', path: [lang, 'detail'], message: 'URL がある作品に個別ページの本文（detail）は付けられません' });
        }
      }
    });

// スキル: src/content/skills/<カテゴリID>.yaml
export const skillSchema = z.strictObject({
  order,
  label: bilingual,
  items: z.array(z.strictObject({ name: text, usage: bilingual })).min(1),
});

// 職歴: src/content/career/<職歴ID>.yaml。会社名などの項目は定義せず、strict で混入を拒否する。
export const careerSchema = z.strictObject({
  order,
  start: year,
  end: year.optional(),
  field: bilingual,
  description: bilingual,
});

// 外部リンク: src/content/links/<ID>.yaml
export const linkSchema = z.strictObject({
  order,
  label: text,
  kind: z.enum(['github', 'sns', 'email']),
  url: z.string().regex(/^(https:\/\/|mailto:)\S+$/, { error: 'https:// または mailto: で始めてください' }),
});

// 稼働状況: src/content/status/<ID>.yaml。更新日（YYYY-MM-DD）の最新を「最終更新」として表示する。
export const statusSchema = z.strictObject({
  order,
  kind: z.enum(['running', 'idle', 'next']),
  text: bilingual,
  updated: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { error: 'YYYY-MM-DD 形式で指定してください' }),
});

/** order の重複を返す。表示順が決まらないためビルドエラーにする。 */
export function findDuplicateOrders(items: { id: string; order: number }[]): number[] {
  const seen = new Set<number>();
  const dup = new Set<number>();
  for (const { order } of items) (seen.has(order) ? dup : seen).add(order);
  return [...dup];
}
