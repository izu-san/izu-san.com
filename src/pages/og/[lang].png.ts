import type { APIRoute, GetStaticPaths } from 'astro';
import { getEntry } from 'astro:content';
import { languages, type Lang } from '../../lib/i18n.ts';
import { renderOgImage } from '../../lib/og-image.ts';

// 日英別の共有画像（/og/ja.png、/og/en.png）。名前と一言はプロフィールから取る。
export const getStaticPaths = (() => languages.map((lang) => ({ params: { lang } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang;
  const profile = (await getEntry('profile', lang))!.data;
  const png = await renderOgImage({ name: profile.name, headline: profile.headline, tag: 'PORTFOLIO' });
  return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
};
