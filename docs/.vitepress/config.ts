// The documentation site: the Markdown under docs/, the package README as the guide, and the API
// reference TypeDoc writes into docs/api. Published on
// GitHub Pages by .github/workflows/docs.yml: https://bvdmitri.github.io/webtween/.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { defineConfig, type DefaultTheme } from 'vitepress';

import { siteLink } from '../../tools/docs/src/links.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPOSITORY = 'https://github.com/bvdmitri/webtween';

// Every ADR in number order, named by its own title.
function decisions(): DefaultTheme.SidebarItem[] {
  return readdirSync(path.join(ROOT, 'adr'))
    .filter((file) => /^\d{4}-.*\.md$/u.test(file))
    .toSorted()
    .map((file) => {
      const [title = file] = readFileSync(path.join(ROOT, 'adr', file), 'utf8').split('\n', 1);
      return { text: title.replace(/^# ADR /u, ''), link: `/adr/${file.replace(/\.md$/u, '')}` };
    });
}

// The API pages' sidebar, which TypeDoc writes beside them.
function api(): DefaultTheme.SidebarItem[] {
  const sidebar = path.join(ROOT, 'api', 'typedoc-sidebar.json');
  return existsSync(sidebar)
    ? (JSON.parse(readFileSync(sidebar, 'utf8')) as DefaultTheme.SidebarItem[])
    : [];
}

export default defineConfig({
  title: 'webtween',
  description: 'Smooth slow motion in the browser: frames generated between frames on WebGPU.',
  base: '/webtween/',
  cleanUrls: true,
  lastUpdated: false,
  srcExclude: ['adr/TEMPLATE.md'],
  markdown: {
    config: (md) => {
      // A link from a page into the code goes to the file on GitHub.
      md.core.ruler.push('code-links', (state) => {
        const page = `docs/${String(state.env.relativePath ?? '')}`;
        for (const token of state.tokens) {
          for (const child of token.children ?? []) {
            const href = child.type === 'link_open' ? child.attrGet('href') : null;
            if (href !== null) child.attrSet('href', siteLink(href, page));
          }
        }
      });
    },
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
      { text: 'Model', link: '/MODEL' },
      { text: 'Decisions', link: '/adr/' },
      { text: 'Changelog', link: '/changelog' },
    ],
    sidebar: {
      '/api/': [{ text: 'API reference', items: api() }],
      '/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Roadmap', link: '/roadmap' },
            { text: 'Changelog', link: '/changelog' },
          ],
        },
        {
          text: 'Design',
          items: [
            { text: 'Architecture', link: '/ARCHITECTURE' },
            { text: 'The model', link: '/MODEL' },
            { text: 'Samples and fixtures', link: '/SAMPLES' },
          ],
        },
        { text: 'Decisions', link: '/adr/', collapsed: true, items: decisions() },
      ],
    },
    socialLinks: [{ icon: 'github', link: REPOSITORY }],
    search: { provider: 'local' },
    editLink: { pattern: `${REPOSITORY}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    footer: { message: 'Released under the MIT License.' },
  },
});
