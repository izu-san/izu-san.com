import type { APIRoute } from 'astro';
import { loadWorkDetails } from '../lib/content.ts';
import { languages, paths, workPath, type Lang } from '../lib/i18n.ts';

// 日英のページを、互いの alternate 付きで並べる。公開 URL のない作品の個別ページ（ZJS-20）も含める。
// プレビューは載せない（空の urlset）。
export const GET: APIRoute = async ({ site }) => {
  const isPreview = import.meta.env.PUBLIC_SITE_ENV === 'preview';
  const abs = (path: string) => new URL(path, site).href;
  const group = (pathOf: (l: Lang) => string) => {
    const alternates = [
      ...languages.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(pathOf(l))}"/>`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(pathOf('ja'))}"/>`,
    ].join('\n');
    return languages.map((l) => `  <url>\n    <loc>${abs(pathOf(l))}</loc>\n${alternates}\n  </url>`);
  };
  const details = await loadWorkDetails();
  const entries = isPreview ? [] : [...group((l) => paths[l]), ...details.flatMap(({ id }) => group((l) => workPath(l, id)))];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    entries.join('\n') +
    (entries.length ? '\n' : '') +
    '</urlset>\n';
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
