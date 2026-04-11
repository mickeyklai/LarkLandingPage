import { defineField, defineType } from 'sanity';

/** Registered object type for Portable Text — inline-only objects can get the wrong `_type` in the API. */
export const patternDownload = defineType({
  name: 'patternDownload',
  title: 'Pattern download (PDF)',
  type: 'object',
  fields: [
    defineField({
      name: 'description',
      title: 'Intro text',
      type: 'text',
      rows: 3,
      description: 'Optional line or two above the download button.',
    }),
    defineField({
      name: 'file',
      title: 'PDF file',
      type: 'file',
      options: {
        accept: 'application/pdf,.pdf',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'linkText',
      title: 'Button label',
      type: 'string',
      initialValue: 'Download pattern PDF',
      validation: (Rule) => Rule.max(120),
    }),
  ],
  preview: {
    select: {
      linkText: 'linkText',
      filename: 'file.asset.originalFilename',
    },
    prepare({ linkText, filename }) {
      return {
        title: linkText || 'Pattern download',
        subtitle: filename || 'PDF',
      };
    },
  },
});
