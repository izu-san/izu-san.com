import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRoute } from 'astro';
import { Resvg } from '@resvg/resvg-js';

// favicon.svg から 180×180 の PNG を作る（iOS のホーム画面用）。
export const GET: APIRoute = () => {
  const svg = readFileSync(join(process.cwd(), 'public/favicon.svg'), 'utf8');
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 180 } }).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
};
