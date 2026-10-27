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
  statusSchema,
} from '../src/lib/schemas.ts';

const workSchema = createWorkSchema(z.string());

const work = () => ({
  order: 1,
  tech: ['TypeScript'],
  url: 'https://example.com/a',
  ja: { name: 'Sample', summary: '概要' },
  en: { name: 'Sample', summary: 'Summary' },
});

const detail = (text: string) => ({ lead: text, sections: [{ heading: text, body: [text] }] });

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

test('作品: URL を省略できるのは、個別ページの本文（日英）があるときだけ（公開 URL が無い作品）', () => {
  const w: any = work();
  delete w.url;
  w.ja.detail = detail('本文');
  w.en.detail = detail('Body');
  assert.equal(workSchema.safeParse(w).success, true);
});

test('作品: URL が http(s) でなければエラー', () => {
  fails(workSchema, { ...work(), url: 'not-a-url' }, 'url');
});

test('プロフィール: アバターの代替テキストが空ならエラー', () => {
  fails(profileSchema, { ...profile(), avatarAlt: ' ' }, 'avatarAlt');
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
  const p = { name: 'a', headline: '', pageTitle: 'a', description: 'a', avatarAlt: 'a', interests: ['a'] };
  fails(profileSchema, p, 'headline');
});

test('外部リンク: https と mailto 以外の URL はエラー', () => {
  assert.equal(linkSchema.safeParse({ order: 1, label: 'X', kind: 'sns', url: 'http://example.com' }).success, false);
  assert.equal(linkSchema.safeParse({ order: 1, label: 'Mail', kind: 'email', url: 'mailto:a@example.com' }).success, true);
});

test('order の重複を検出する', () => {
  assert.deepEqual(findDuplicateOrders([{ id: 'a', order: 1 }, { id: 'b', order: 1 }, { id: 'c', order: 2 }]), [1]);
});

const profile = () => ({
  name: 'a',
  headline: 'a',
  pageTitle: 'a',
  description: 'a',
  avatarAlt: 'a',
  interests: ['X', 'Y'],
  tokens: [{ word: 'X', candidates: [{ text: 'a', p: 0.6 }, { text: 'b', p: 0.3 }] }],
});

test('プロフィール: 次トークン候補つきの正しいデータは通る', () => {
  assert.equal(profileSchema.safeParse(profile()).success, true);
});

test('プロフィール: interests にない語の候補はエラー', () => {
  const p = profile();
  p.tokens[0].word = 'Z';
  fails(profileSchema, p, 'tokens.0.word');
});

test('プロフィール: 候補の確率の合計が 1 を超えるとエラー', () => {
  const p = profile();
  p.tokens[0].candidates[0].p = 0.9;
  fails(profileSchema, p, 'tokens.0.candidates');
});

test('稼働状況: 英語の文言が欠けるとエラー', () => {
  const s = { order: 1, kind: 'running', updated: '2026-10-26', text: { ja: 'a' } };
  fails(statusSchema, s, 'text.en');
});

test('稼働状況: 日付の形式と種別を検査する', () => {
  const ok = { order: 1, kind: 'idle', updated: '2026-10-26', text: { ja: 'a', en: 'a' } };
  assert.equal(statusSchema.safeParse(ok).success, true);
  fails(statusSchema, { ...ok, updated: '2026-13-01' }, 'updated');
  fails(statusSchema, { ...ok, kind: 'stopped' }, 'kind');
});

test('作品: URL がなければ個別ページの本文（日英）が必須', () => {
  const { url: _url, ...noUrl } = work();
  fails(workSchema, noUrl, 'ja.detail');
  fails(workSchema, { ...noUrl, ja: { ...noUrl.ja, detail: detail('本文') } }, 'en.detail');
  assert.equal(
    workSchema.safeParse({ ...noUrl, ja: { ...noUrl.ja, detail: detail('本文') }, en: { ...noUrl.en, detail: detail('Body') } }).success,
    true,
  );
});

test('作品: URL があるときは個別ページの本文を付けられない', () => {
  fails(workSchema, { ...work(), ja: { ...work().ja, detail: detail('本文') } }, 'ja.detail');
  assert.equal(workSchema.safeParse(work()).success, true);
});

test('作品: 個別ページは日英で節・要点・構成図の数が揃っていなければエラー', () => {
  const { url: _url, ...noUrl } = work();
  const ja = detail('本文');
  const en = { ...detail('Body'), sections: [...detail('Body').sections, { heading: 'More', body: ['More'] }] };
  fails(workSchema, { ...noUrl, ja: { ...noUrl.ja, detail: ja }, en: { ...noUrl.en, detail: en } }, 'en.detail');
});

test('作品: 節には本文・要点・構成図のいずれかが必要で、構成図は 2 行以上', () => {
  const { url: _url, ...noUrl } = work();
  const empty = { lead: 'x', sections: [{ heading: 'x' }] };
  fails(workSchema, { ...noUrl, ja: { ...noUrl.ja, detail: empty }, en: { ...noUrl.en, detail: empty } }, 'ja.detail.sections.0');
  const one = { lead: 'x', sections: [{ heading: 'x', diagram: { caption: 'x', rows: [{ label: 'x', nodes: [{ name: 'x' }] }] } }] };
  fails(workSchema, { ...noUrl, ja: { ...noUrl.ja, detail: one }, en: { ...noUrl.en, detail: one } }, 'ja.detail.sections.0.diagram.rows');
});
