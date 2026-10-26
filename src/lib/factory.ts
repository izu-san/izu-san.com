// ミニ工場パズルの盤面とシミュレーション。表示（FactoryPuzzle.astro）から切り離してテストできるようにする。
// S: 入口、G: 出口、#: 壁、.: 空きマス。
export const LAYOUT = ['.....', '.#.#.', 'S..#G', '.#.#.', '.....'] as const;
export const SIZE = LAYOUT.length;

/** ベルトの向き。0 はなし、1〜4 は右・下・左・上。 */
export const DELTAS = [
  [0, 0],
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

export type Result = 'goal' | 'out' | 'wall' | 'gap' | 'loop';

export const emptyBelts = (): number[][] => Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));

function findStart(): [number, number] {
  for (let r = 0; r < SIZE; r++) {
    const c = LAYOUT[r].indexOf('S');
    if (c >= 0) return [r, c];
  }
  throw new Error('入口がありません');
}

/** 入口から右へ送り出した素材がたどる経路と、結果を返す。 */
export function simulate(belts: number[][]): { path: [number, number][]; result: Result } {
  const path: [number, number][] = [];
  const seen = new Set<number>();
  let [r, c] = findStart();
  c += 1;
  for (;;) {
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return { path, result: 'out' };
    const cell = LAYOUT[r][c];
    if (cell === 'G') return { path: [...path, [r, c]], result: 'goal' };
    if (cell === '#') return { path, result: 'wall' };
    const belt = belts[r][c];
    if (!belt) return { path: [...path, [r, c]], result: 'gap' };
    if (seen.has(r * SIZE + c)) return { path, result: 'loop' };
    seen.add(r * SIZE + c);
    path.push([r, c]);
    r += DELTAS[belt][0];
    c += DELTAS[belt][1];
  }
}
