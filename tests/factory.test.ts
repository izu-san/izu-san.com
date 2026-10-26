import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyBelts, simulate } from '../src/lib/factory.ts';

const R = 1, D = 2, L = 3, U = 4;

function belts(cells: [number, number, number][]) {
  const b = emptyBelts();
  for (const [r, c, d] of cells) b[r][c] = d;
  return b;
}

test('工場パズル: 壁を迂回して出口に届く', () => {
  const b = belts([[2, 1, R], [2, 2, U], [1, 2, U], [0, 2, R], [0, 3, R], [0, 4, D], [1, 4, D]]);
  assert.equal(simulate(b).result, 'goal');
});

test('工場パズル: 下側を回る経路でも届く', () => {
  const b = belts([[2, 1, R], [2, 2, D], [3, 2, D], [4, 2, R], [4, 3, R], [4, 4, U], [3, 4, U]]);
  assert.equal(simulate(b).result, 'goal');
});

test('工場パズル: ベルトが無ければ最初のマスで途切れる', () => {
  assert.deepEqual(simulate(emptyBelts()), { path: [[2, 1]], result: 'gap' });
});

test('工場パズル: 壁にぶつかる', () => {
  const b = belts([[2, 1, R], [2, 2, R]]);
  assert.equal(simulate(b).result, 'wall');
});

test('工場パズル: 盤面の外へ落ちる', () => {
  const b = belts([[2, 1, L], [2, 0, L]]);
  assert.equal(simulate(b).result, 'out');
});

test('工場パズル: ぐるぐる回ると停止する', () => {
  const b = belts([[2, 1, R], [2, 2, D], [3, 2, U]]);
  assert.equal(simulate(b).result, 'loop');
});
