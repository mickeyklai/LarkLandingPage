import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './schemaTypes/index.js';

/** Public project id (same as SANITY_PROJECT_ID on Netlify / in root .env). */
const projectId = 'cb72ulln';
const dataset = 'production';

export default defineConfig({
  name: 'default',
  title: 'Lark Elwood Blog',
  projectId,
  dataset,
  plugins: [structureTool()],
  schema: {
    types: schemaTypes,
  },
});
