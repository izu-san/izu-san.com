import { z } from 'astro/zod';

// 空欄・未定義を許さない文字列。日英で同じ表記（固有の作品名など）は許可する。
export const text = z
  .string({ error: '未定義です' })
  .trim()
  .min(1, { error: '空欄です' });

export const bilingual = z.strictObject({ ja: text, en: text });

const order = z.number().int().positive();
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'YYYY-MM 形式で指定してください' });

// プロフィール: src/content/profile/{ja,en}.md（本文は Markdown）
export const profileSchema = z.strictObject({
  name: text,
  headline: text,
  pageTitle: text,
  description: text,
  interests: z.array(text).min(1),
});

// 作品: src/content/works/<作品ID>.yaml。日英を 1 ファイルに持たせ、作品 ID の食い違いを構造上起こさない。
const workCopy = z.strictObject({
  name: text,
  summary: text,
  imageAlt: text.optional(),
});

export const createWorkSchema = (image: z.ZodType) =>
  z
    .strictObject({
      order,
      tech: z.array(text).min(1),
      url: z.httpUrl(),
      image: image.optional(),
      ja: workCopy,
      en: workCopy,
    })
    .superRefine((work, ctx) => {
      if (!work.image) return;
      for (const lang of ['ja', 'en'] as const) {
        if (!work[lang].imageAlt) {
          ctx.addIssue({ code: 'custom', path: [lang, 'imageAlt'], message: '画像があるときは代替テキストが必須です' });
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
  start: yearMonth,
  end: yearMonth.optional(),
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

/** order の重複を返す。表示順が決まらないためビルドエラーにする。 */
export function findDuplicateOrders(items: { id: string; order: number }[]): number[] {
  const seen = new Set<number>();
  const dup = new Set<number>();
  for (const { order } of items) (seen.has(order) ? dup : seen).add(order);
  return [...dup];
}
