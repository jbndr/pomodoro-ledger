import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const changelog = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/changelog" }),
  schema: z.object({ n: z.number(), title: z.string(), date: z.coerce.date(), features: z.array(z.string()).default([]) }),
});

const post = z.object({
  title: z.string(),
  description: z.string(),
  date: z.coerce.date(),
  draft: z.boolean().default(false),
});

const devlog = defineCollection({ loader: glob({ pattern: "*.md", base: "./src/content/devlog" }), schema: post });
const guides = defineCollection({ loader: glob({ pattern: "*.md", base: "./src/content/guides" }), schema: post });

export const collections = { changelog, devlog, guides };
