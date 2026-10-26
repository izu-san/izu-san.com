import { getCollection, getEntry, render } from 'astro:content';
import { findDuplicateOrders } from './schemas.ts';
import { languages, type Lang } from './i18n.ts';

function sorted<T extends { id: string; data: { order: number } }>(name: string, entries: T[]): T[] {
  const dup = findDuplicateOrders(entries.map((e) => ({ id: e.id, order: e.data.order })));
  if (dup.length) throw new Error(`${name}: order が重複しています: ${dup.join(', ')}`);
  return entries.toSorted((a, b) => a.data.order - b.data.order);
}

/** 日英のプロフィールが両方あり、本文が空でないことを確認する。 */
async function loadProfile(lang: Lang) {
  for (const l of languages) {
    const entry = await getEntry('profile', l);
    if (!entry) throw new Error(`profile/${l}.md がありません`);
    if (!entry.body?.trim()) throw new Error(`profile/${l}.md の本文が空です`);
  }
  const entry = (await getEntry('profile', lang))!;
  const { Content } = await render(entry);
  return { data: entry.data, Content };
}

export async function loadSiteContent(lang: Lang) {
  const works = sorted('works', await getCollection('works'));
  const skills = sorted('skills', await getCollection('skills'));
  const career = sorted('career', await getCollection('career'));
  const links = sorted('links', await getCollection('links'));
  const status = sorted('status', await getCollection('status'));
  return {
    profile: await loadProfile(lang),
    works: works.map(({ id, data }) => ({ id, ...data, copy: data[lang] })),
    skills: skills.map(({ id, data }) => ({ id, label: data.label[lang], items: data.items.map((i) => ({ name: i.name, usage: i.usage[lang] })) })),
    career: career.map(({ id, data }) => ({ id, start: data.start, end: data.end, field: data.field[lang], description: data.description[lang] })),
    status: {
      items: status.map(({ id, data }) => ({ id, kind: data.kind, text: data.text[lang] })),
      updated: status.map(({ data }) => data.updated).toSorted().at(-1) ?? '',
    },
    links: links.map(({ id, data }) => ({ id, ...data })),
  };
}
