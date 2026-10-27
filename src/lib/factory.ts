// ミニ工場パズルのステージ・シミュレーション・記録。表示（FactoryPuzzle.astro）から切り離してテストできるようにする。
// 盤面の文字: .: 空きマス、#: 壁、1〜9: 入口（右へ素材を送り出す）、M: 組み立て機、G: 出口。

export interface Stage {
  id: string;
  layout: readonly string[];
  /** 入口 1, 2, 3… が出す素材。作品の使用技術の名前を使う。 */
  sources: readonly string[];
  /** 出口が求める注文。素材をすべてそろえると、対応する作品の説明が出る。 */
  order: { workId: string; needs: readonly string[] };
}

export const STAGES: readonly Stage[] = [
  {
    id: 'stage-1',
    layout: ['.....', '.#.#.', '1..#G', '.#.#.', '.....'],
    sources: ['Astro'],
    order: { workId: 'izu-san-com', needs: ['Astro'] },
  },
  {
    id: 'stage-2',
    layout: ['1.....', '.##.#.', '...M.G', '.##.#.', '2.....'],
    sources: ['Python', 'Claude Code'],
    order: { workId: 'e2e-estimation-lab', needs: ['Python', 'Claude Code'] },
  },
  {
    id: 'stage-3',
    layout: ['1.....#', '2..M..#', '.#.#M.G', '.#.#.#.', '3......'],
    sources: ['Docker Compose', 'GitLab', 'YouTrack'],
    order: { workId: 'home-server', needs: ['Docker Compose', 'GitLab', 'YouTrack'] },
  },
];

/** 組み立て機が素材を受け取る数。 */
export const MACHINE_INPUTS = 2;

/** ベルトの向き。0 はなし、1〜4 は右・下・左・上。 */
export const DELTAS = [
  [0, 0],
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

export type Pos = [number, number];
export type TrackEnd = 'goal' | 'out' | 'wall' | 'gap' | 'loop' | 'machine';
export type Result = 'goal' | 'wrong' | 'short' | 'out' | 'wall' | 'gap' | 'loop';

export interface Track {
  path: Pos[];
  materials: string[];
  end: TrackEnd;
}

export const rowsOf = (stage: Stage) => stage.layout.length;
export const colsOf = (stage: Stage) => stage.layout[0].length;

export const emptyBelts = (stage: Stage): number[][] =>
  Array.from({ length: rowsOf(stage) }, () => Array<number>(colsOf(stage)).fill(0));

export const isSource = (cell: string | undefined) => cell !== undefined && cell >= '1' && cell <= '9';

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((m) => b.includes(m));

/** from のマスに入った素材が、ベルトをたどって行き着く先を返す。 */
function run(stage: Stage, belts: number[][], from: Pos, materials: string[]): Track {
  const path: Pos[] = [];
  const seen = new Set<string>();
  let [r, c] = from;
  for (;;) {
    const cell = stage.layout[r]?.[c];
    if (cell === undefined) return { path, materials, end: 'out' };
    if (cell === 'G') return { path: [...path, [r, c]], materials, end: 'goal' };
    if (cell === 'M') return { path: [...path, [r, c]], materials, end: 'machine' };
    if (cell === '#' || isSource(cell)) return { path, materials, end: 'wall' };
    const belt = belts[r][c];
    if (!belt) return { path: [...path, [r, c]], materials, end: 'gap' };
    const key = `${r},${c}`;
    if (seen.has(key)) return { path, materials, end: 'loop' };
    seen.add(key);
    path.push([r, c]);
    r += DELTAS[belt][0];
    c += DELTAS[belt][1];
  }
}

/**
 * すべての入口から素材を送り出し、組み立て機で合わさった素材も含めて、たどった経路と結果を返す。
 * tracks は動かした順（入口の番号順、そのあと組み立て機から出た順）。
 */
export function simulate(stage: Stage, belts: number[][]): { tracks: Track[]; result: Result } {
  const queue: { from: Pos; materials: string[] }[] = [];
  const machines = new Map<string, string[][]>();
  for (let n = 1; n <= stage.sources.length; n++) {
    for (let r = 0; r < rowsOf(stage); r++) {
      const c = stage.layout[r].indexOf(String(n));
      if (c >= 0) queue.push({ from: [r, c + 1], materials: [stage.sources[n - 1]] });
    }
  }

  const tracks: Track[] = [];
  while (queue.length) {
    const job = queue.shift()!;
    const track = run(stage, belts, job.from, job.materials);
    tracks.push(track);
    if (track.end !== 'machine') continue;
    const [r, c] = track.path[track.path.length - 1];
    const key = `${r},${c}`;
    const arrived = [...(machines.get(key) ?? []), track.materials];
    machines.set(key, arrived);
    // 受け取りがそろったときに 1 回だけ、合わせた素材を右へ送り出す。
    if (arrived.length === MACHINE_INPUTS) {
      const merged = [...new Set(arrived.flat())].toSorted();
      queue.push({ from: [r, c + 1], materials: merged });
    }
  }

  const delivered = tracks.filter((t) => t.end === 'goal');
  if (delivered.some((t) => sameSet(t.materials, stage.order.needs))) return { tracks, result: 'goal' };
  const failed = tracks.find((t) => t.end === 'out' || t.end === 'wall' || t.end === 'gap' || t.end === 'loop');
  if (failed) return { tracks, result: failed.end as Result };
  if (delivered.length) return { tracks, result: 'wrong' };
  if ([...machines.values()].some((arrived) => arrived.length < MACHINE_INPUTS)) return { tracks, result: 'short' };
  return { tracks, result: 'gap' };
}

/** ステージの定義が正しいかを調べ、問題の説明を返す（問題がなければ空）。works は作品の ID と使用技術。 */
export function validateStages(stages: readonly Stage[], works: { id: string; tech: readonly string[] }[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const stage of stages) {
    const at = (message: string) => errors.push(`${stage.id}: ${message}`);
    if (ids.has(stage.id)) at('ID が重複しています');
    ids.add(stage.id);
    if (stage.layout.some((row) => row.length !== colsOf(stage))) at('盤面の幅がそろっていません');
    const cells = stage.layout.join('');
    if ([...cells].some((ch) => !'.#MG'.includes(ch) && !isSource(ch))) at('盤面に定義外の文字があります');
    const count = (ch: string) => [...cells].filter((x) => x === ch).length;
    if (count('G') !== 1) at('出口（G）は 1 つだけ置きます');
    for (let n = 1; n <= stage.sources.length; n++) {
      if (count(String(n)) !== 1) at(`入口 ${n} は 1 つだけ置きます`);
    }
    if ([...cells].filter(isSource).length !== stage.sources.length) at('入口の数と素材の数が合っていません');
    if (count('M') !== stage.sources.length - 1) at('組み立て機は「入口の数 - 1」個必要です');
    if (!sameSet(stage.sources, stage.order.needs) || new Set(stage.sources).size !== stage.sources.length) {
      at('注文の素材は、入口の素材（重複なし）と同じにしてください');
    }
    const work = works.find((w) => w.id === stage.order.workId);
    if (!work) at(`作品 ${stage.order.workId} がありません`);
    else {
      for (const material of stage.order.needs) {
        if (!work.tech.includes(material)) at(`${material} は作品 ${work.id} の使用技術にありません`);
      }
    }
  }
  return errors;
}

/** ステージ ID ごとの、クリアしたときのベルトの最少本数。 */
export type Records = Record<string, number>;

export const STORAGE_KEY = 'izu-san:factory:v1';

export const beltCount = (belts: number[][]) => belts.flat().filter((belt) => belt > 0).length;

/** 保存された文字列を記録に直す。壊れた値や、定義にないステージは捨てる。 */
export function parseRecords(raw: string | null, stages: readonly Stage[] = STAGES): Records {
  if (!raw) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const records: Records = {};
  for (const stage of stages) {
    const count = (value as Record<string, unknown>)[stage.id];
    if (typeof count === 'number' && Number.isInteger(count) && count > 0) records[stage.id] = count;
  }
  return records;
}

/** クリアを記録に反映する。本数が前より少ないとき（初めてのクリアを含む）だけ更新し、improved を true にする。 */
export function recordClear(records: Records, stageId: string, count: number): { records: Records; improved: boolean } {
  const best = records[stageId];
  if (best !== undefined && best <= count) return { records, improved: false };
  return { records: { ...records, [stageId]: count }, improved: true };
}
