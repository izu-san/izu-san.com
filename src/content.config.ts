import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  careerSchema,
  createWorkSchema,
  linkSchema,
  profileSchema,
  skillSchema,
  statusSchema,
} from './lib/schemas.ts';

const dir = (name: string, ext: string) => glob({ base: `./src/content/${name}`, pattern: `*.${ext}` });

export const collections = {
  profile: defineCollection({ loader: dir('profile', 'md'), schema: profileSchema }),
  works: defineCollection({ loader: dir('works', 'yaml'), schema: ({ image }) => createWorkSchema(image()) }),
  skills: defineCollection({ loader: dir('skills', 'yaml'), schema: skillSchema }),
  career: defineCollection({ loader: dir('career', 'yaml'), schema: careerSchema }),
  status: defineCollection({ loader: dir('status', 'yaml'), schema: statusSchema }),
  links: defineCollection({ loader: dir('links', 'yaml'), schema: linkSchema }),
};
