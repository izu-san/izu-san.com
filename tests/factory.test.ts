import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STAGES,
  beltCount,
  emptyBelts,
  parseRecords,
  recordClear,
  simulate,
  validateStages,
  type Stage,
} from '../src/lib/factory.ts';

const R = 1, D = 2, L = 3, U = 4;

function belts(stage: Stage, cells: [number, number, number][]) {
  const b = emptyBelts(stage);
  for (const [r, c, d] of cells) b[r][c] = d;
  return b;
}

const [stage1, stage2, stage3] = STAGES;

// ステージごとの解。ほかのテストの土台にもなる。
const solution1: [number, number, number][] = [[2, 1, R], [2, 2, U], [1, 2, U], [0, 2, R], [0, 3, R], [0, 4, D], [1, 4, D]];
const solution2: [number, number, number][] = [
  [0, 1, R], [0, 2, R], [0, 3, D], [1, 3, D],
  [4, 1, R], [4, 2, R], [4, 3, U], [3, 3, U],
  [2, 4, R],
];
const solution3: [number, number, number][] = [
  [0, 1, R], [0, 2, R], [0, 3, D],
  [1, 1, R], [1, 2, R],
  [1, 4, D],
  [4, 1, R], [4, 2, R], [4, 3, R], [4, 4, U], [3, 4, U],
  [2, 5, R],
];

test('工場パズル: ステージの定義が正しい', () => {
  const works = [
    { id: 'izu-san-com', tech: ['Astro', 'TypeScript'] },
    { id: 'e2e-estimation-lab', tech: ['Python', 'Claude Code', 'Playwright'] },
    { id: 'home-server', tech: ['Docker Compose', 'GitLab', 'YouTrack', 'Linux'] },
  ];
  assert.deepEqual(validateStages(STAGES, works), []);
});

test('工場パズル: 注文の素材が作品の使用技術にないと検出する', () => {
  const works = [{ id: 'izu-san-com', tech: ['TypeScript'] }];
  const errors = validateStages([stage1], works);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Astro は作品 izu-san-com の使用技術にありません/);
});

test('工場パズル: 盤面の不備を検出する', () => {
  const works = [{ id: 'w', tech: ['A', 'B'] }];
  const base: Stage = { id: 's', layout: ['1.G'], sources: ['A'], order: { workId: 'w', needs: ['A'] } };
  assert.deepEqual(validateStages([base], works), []);
  assert.ok(validateStages([{ ...base, layout: ['1.GG'] }], works).length > 0, '出口が 2 つ');
  assert.ok(validateStages([{ ...base, layout: ['1.G', '..'] }], works).length > 0, '幅が不ぞろい');
  assert.ok(validateStages([{ ...base, layout: ['1xG'] }], works).length > 0, '定義外の文字');
  assert.ok(validateStages([{ ...base, layout: ['1MG'] }], works).length > 0, '組み立て機が多すぎる');
  assert.ok(validateStages([{ ...base, order: { workId: 'w', needs: ['B'] } }], works).length > 0, '注文と入口が違う');
  assert.ok(validateStages([{ ...base, order: { workId: 'none', needs: ['A'] } }], works).length > 0, '作品がない');
  assert.ok(validateStages([base, base], works).length > 0, 'ID の重複');
});

test('工場パズル: ステージ 1 は壁を迂回して出口に届く', () => {
  assert.equal(simulate(stage1, belts(stage1, solution1)).result, 'goal');
});

test('工場パズル: ステージ 1 は下側を回る経路でも届く', () => {
  const b = belts(stage1, [[2, 1, R], [2, 2, D], [3, 2, D], [4, 2, R], [4, 3, R], [4, 4, U], [3, 4, U]]);
  assert.equal(simulate(stage1, b).result, 'goal');
});

test('工場パズル: ベルトが無ければ最初のマスで途切れる', () => {
  const { tracks, result } = simulate(stage1, emptyBelts(stage1));
  assert.equal(result, 'gap');
  assert.deepEqual(tracks[0].path, [[2, 1]]);
});

test('工場パズル: 壁にぶつかる', () => {
  assert.equal(simulate(stage1, belts(stage1, [[2, 1, R], [2, 2, R]])).result, 'wall');
});

test('工場パズル: 盤面の外へ落ちる', () => {
  assert.equal(simulate(stage1, belts(stage1, [[2, 1, R], [2, 2, U], [1, 2, U], [0, 2, U]])).result, 'out');
});

test('工場パズル: 入口の方へ戻しても壁と同じ扱いになる', () => {
  assert.equal(simulate(stage1, belts(stage1, [[2, 1, L]])).result, 'wall');
});

test('工場パズル: ぐるぐる回ると停止する', () => {
  assert.equal(simulate(stage1, belts(stage1, [[2, 1, R], [2, 2, D], [3, 2, U]])).result, 'loop');
});

test('工場パズル: ステージ 2 は 2 つの素材を組み立て機で合わせて届ける', () => {
  const { tracks, result } = simulate(stage2, belts(stage2, solution2));
  assert.equal(result, 'goal');
  const delivered = tracks.find((t) => t.end === 'goal')!;
  assert.deepEqual(delivered.materials, ['Claude Code', 'Python']);
});

test('工場パズル: 組み立て機を通さず片方だけでは届かない', () => {
  // 入口 1 の素材だけを組み立て機に入れ、入口 2 のベルトは置かない。
  const b = belts(stage2, [[0, 1, R], [0, 2, R], [0, 3, D], [1, 3, D], [2, 4, R]]);
  assert.equal(simulate(stage2, b).result, 'gap');
});

test('工場パズル: 組み立て機に素材が 1 つしか入らないと足りない', () => {
  const stage: Stage = { id: 't', layout: ['1MG'], sources: ['A'], order: { workId: 'w', needs: ['A'] } };
  assert.equal(simulate(stage, emptyBelts(stage)).result, 'short');
});

test('工場パズル: 出口に届いても、素材が注文と違えば受け付けない', () => {
  const stage: Stage = { id: 't', layout: ['1.G'], sources: ['A'], order: { workId: 'w', needs: ['A', 'B'] } };
  assert.equal(simulate(stage, belts(stage, [[0, 1, R]])).result, 'wrong');
});

test('工場パズル: 途切れた入口があれば、そちらを先に伝える', () => {
  const b = belts(stage2, [[0, 1, R], [0, 2, R], [0, 3, D], [1, 3, D], [2, 4, R]]);
  assert.equal(simulate(stage2, b).result, 'gap');
});

test('工場パズル: ステージ 3 は組み立て機 2 台で 3 つの素材を合わせて届ける', () => {
  const { tracks, result } = simulate(stage3, belts(stage3, solution3));
  assert.equal(result, 'goal');
  const delivered = tracks.find((t) => t.end === 'goal')!;
  assert.deepEqual(delivered.materials, ['Docker Compose', 'GitLab', 'YouTrack']);
});

test('工場パズル: ステージ 3 は 1 本欠けると届かない', () => {
  const b = belts(stage3, solution3.filter(([r, c]) => !(r === 1 && c === 4)));
  assert.equal(simulate(stage3, b).result, 'gap');
});

test('工場パズル: 組み立て機は受け取りがそろったときに 1 回だけ送り出す', () => {
  const { tracks } = simulate(stage3, belts(stage3, solution3));
  // 入口 3 本 + 組み立て機から出る 2 本。
  assert.equal(tracks.length, 5);
});

test('工場パズル: ベルトの数を数える', () => {
  assert.equal(beltCount(emptyBelts(stage1)), 0);
  assert.equal(beltCount(belts(stage1, solution1)), solution1.length);
  assert.equal(beltCount(belts(stage2, solution2)), solution2.length);
  assert.equal(beltCount(belts(stage3, solution3)), solution3.length);
});

test('記録: 初めてのクリアと、より少ない本数のときだけ更新する', () => {
  const first = recordClear({}, 'stage-1', 9);
  assert.deepEqual(first, { records: { 'stage-1': 9 }, improved: true });
  const same = recordClear(first.records, 'stage-1', 9);
  assert.equal(same.improved, false);
  assert.equal(recordClear(first.records, 'stage-1', 12).improved, false);
  const better = recordClear(first.records, 'stage-1', 7);
  assert.deepEqual(better, { records: { 'stage-1': 7 }, improved: true });
  assert.deepEqual(first.records, { 'stage-1': 9 }, '元の記録は変えない');
});

test('記録: 保存された値を読み戻す', () => {
  assert.deepEqual(parseRecords(JSON.stringify({ 'stage-1': 7, 'stage-2': 9 })), { 'stage-1': 7, 'stage-2': 9 });
});

test('記録: 壊れた値・定義にないステージ・不正な本数は捨てる', () => {
  assert.deepEqual(parseRecords(null), {});
  assert.deepEqual(parseRecords(''), {});
  assert.deepEqual(parseRecords('{'), {});
  assert.deepEqual(parseRecords('[1,2]'), {});
  assert.deepEqual(parseRecords('"text"'), {});
  assert.deepEqual(parseRecords(JSON.stringify({ 'stage-9': 3 })), {});
  assert.deepEqual(parseRecords(JSON.stringify({ 'stage-1': 0, 'stage-2': -1, 'stage-3': 2.5 })), {});
  assert.deepEqual(parseRecords(JSON.stringify({ 'stage-1': '7' })), {});
});
