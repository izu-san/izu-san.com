import type { APIRoute } from 'astro';
import { languages, paths } from '../lib/i18n.ts';

// 日英のページを、互いの alternate 付きで並べる。プレビューは載せない（空の urlset）。
export const GET: APIRoute = ({ site }) => {
  const isPreview = import.meta.env.PUBLIC_SITE_ENV === 'preview';
  const url = (l: (typeof languages)[number]) => new URL(paths[l], site).href;
  const alternates = [
    ...languages.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${url(l)}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${url('ja')}"/>`,
  ].join('\n');
  const entries = isPreview ? [] : languages.map((l) => `  <url>\n    <loc>${url(l)}</loc>\n${alternates}\n  </url>`);
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    entries.join('\n') +
    (entries.length ? '\n' : '') +
    '</urlset>\n';
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
