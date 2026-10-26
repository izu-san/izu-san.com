import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'astro/zod';
import {
  careerSchema,
  createWorkSchema,
  findDuplicateOrders,
  linkSchema,
  profileSchema,
  skillSchema,
} from '../src/lib/schemas.ts';

const workSchema = createWorkSchema(z.string());

const work = () => ({
  order: 1,
  tech: ['TypeScript'],
  url: 'https://example.com/a',
  ja: { name: 'Sample', summary: '概要' },
  en: { name: 'Sample', summary: 'Summary' },
});

const fails = (schema: z.ZodType, value: unknown, path: string) => {
  const result = schema.safeParse(value);
  assert.equal(result.success, false);
  assert.ok(
    result.error?.issues.some((i) => i.path.join('.').startsWith(path)),
    `${path} のエラーが出るはず: ${JSON.stringify(result.error?.issues)}`,
  );
};

test('作品: 正しいデータは通り、日英で同一の名前も許可する', () => {
  assert.equal(workSchema.safeParse(work()).success, true);
});

test('作品: 英語の概要が未定義ならエラー', () => {
  const w: any = work();
  delete w.en.summary;
  fails(workSchema, w, 'en.summary');
});

test('作品: 日本語の名前が空欄（空白のみ）ならエラー', () => {
  const w = work();
  w.ja.name = '  ';
  fails(workSchema, w, 'ja.name');
});

test('作品: 英語側が丸ごと無ければエラー', () => {
  const w: any = work();
  delete w.en;
  fails(workSchema, w, 'en');
});

test('作品: 画像があるのに代替テキストが無ければエラー', () => {
  fails(workSchema, { ...work(), image: 'a.png' }, 'ja.imageAlt');
});

test('スキル: 英語の用途が欠けるとエラー', () => {
  const s = { order: 1, label: { ja: 'AI', en: 'AI' }, items: [{ name: 'X', usage: { ja: '用途' } }] };
  fails(skillSchema, s, 'items.0.usage.en');
});

test('職歴: 英語の業務内容が空欄ならエラー', () => {
  const c = { order: 1, start: '2020-04', field: { ja: 'a', en: 'a' }, description: { ja: 'a', en: '' } };
  fails(careerSchema, c, 'description.en');
});

test('職歴: 会社名など定義外の項目はエラー（非公開情報を持たせない）', () => {
  const c = { order: 1, start: '2020-04', field: { ja: 'a', en: 'a' }, description: { ja: 'a', en: 'a' }, company: 'X' };
  assert.equal(careerSchema.safeParse(c).success, false);
});

test('プロフィール: 必須項目の空欄はエラー', () => {
  const p = { name: 'a', headline: '', pageTitle: 'a', description: 'a', interests: ['a'] };
  fails(profileSchema, p, 'headline');
});

test('外部リンク: https と mailto 以外の URL はエラー', () => {
  assert.equal(linkSchema.safeParse({ order: 1, label: 'X', kind: 'sns', url: 'http://example.com' }).success, false);
  assert.equal(linkSchema.safeParse({ order: 1, label: 'Mail', kind: 'email', url: 'mailto:a@example.com' }).success, true);
});

test('order の重複を検出する', () => {
  assert.deepEqual(findDuplicateOrders([{ id: 'a', order: 1 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }]), [1]);
});
