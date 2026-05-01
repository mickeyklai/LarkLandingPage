import { defineField, defineType } from 'sanity';
import { postPublicUrl } from '../site.js';

export const post = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  groups: [
    { name: 'content', title: 'Content', default: true },
    { name: 'seo', title: 'SEO' },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      group: 'content',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'content',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
      group: 'content',
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      description:
        'Short summary used as the meta description fallback and the card lead. ~140–180 characters works best for Google snippets.',
      type: 'text',
      rows: 4,
      group: 'content',
      validation: (Rule) => Rule.max(320),
    }),
    defineField({
      name: 'mainImage',
      title: 'Main image',
      type: 'image',
      group: 'content',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          type: 'string',
          title: 'Alternative text',
          description:
            'Describes the image for screen readers and SEO. Include "Lark Elwood", "dark romance", and the article topic when natural.',
        }),
      ],
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
      group: 'content',
    }),

    // SEO group ----------------------------------------------------------------
    defineField({
      name: 'seoTitle',
      title: 'SEO title (override)',
      description:
        'Optional. Overrides the <title> tag. Aim for 50–60 chars; lead with the strongest dark-romance keyword phrase. The brand suffix " — Lark Elwood (Dark Romance)" is appended automatically by the edge function.',
      type: 'string',
      group: 'seo',
      validation: (Rule) => Rule.max(70),
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO meta description (override)',
      description:
        'Optional. Overrides the <meta name="description"> for this post. 140–160 chars is ideal for Google snippets. Falls back to "Excerpt".',
      type: 'text',
      rows: 3,
      group: 'seo',
      validation: (Rule) => Rule.max(320),
    }),
    defineField({
      name: 'keywords',
      title: 'SEO keywords / tags',
      description:
        'Topical tags that surface in <meta name="keywords">, OG article:tag, and JSON-LD. Example: dark romance cupcakes, dark romance dessert, gothic baking, Lark Elwood, Independent novel.',
      type: 'array',
      group: 'seo',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
    defineField({
      name: 'focusKeyword',
      title: 'Focus keyword',
      description:
        'The single search phrase you most want this post to rank for (e.g. "dark romance cupcakes"). Used for editorial guidance only — does not appear on the page.',
      type: 'string',
      group: 'seo',
    }),
    defineField({
      name: 'seoImage',
      title: 'Social share image (override)',
      description:
        'Optional. 1200×630 image used for Open Graph / Twitter / Pinterest. Falls back to "Main image".',
      type: 'image',
      group: 'seo',
      options: { hotspot: true },
      fields: [
        defineField({
          name: 'alt',
          type: 'string',
          title: 'Alternative text',
        }),
      ],
    }),
    defineField({
      name: 'noindex',
      title: 'Hide from search engines',
      description:
        'Add a noindex,nofollow robots tag for this post. Use only for drafts you want to publish but exclude from Google.',
      type: 'boolean',
      group: 'seo',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      date: 'publishedAt',
      slug: 'slug',
      media: 'mainImage',
    },
    prepare({ title, date, slug, media }) {
      const slugCurrent = slug?.current;
      const url = postPublicUrl(slugCurrent);
      const datePart = date ? new Date(date).toLocaleDateString() : 'Draft';
      return {
        title: title || 'Untitled',
        subtitle: url ? `${datePart} · ${url}` : datePart,
        media,
      };
    },
  },
});
