import type { APIRoute } from 'astro';

// 本番はクロールを許可し、サイトマップを示す。プレビューは全面拒否（ページ側にも noindex を出す）。
export const GET: APIRoute = ({ site }) => {
  const isPreview = import.meta.env.PUBLIC_SITE_ENV === 'preview';
  const body = isPreview
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', site).href}\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
