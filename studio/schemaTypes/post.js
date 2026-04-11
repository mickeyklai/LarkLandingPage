import { defineField, defineType } from 'sanity';
import { postPublicUrl } from '../site.js';

export const post = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt',
      type: 'text',
      rows: 4,
    }),
    defineField({
      name: 'mainImage',
      title: 'Main image',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'blockContent',
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
