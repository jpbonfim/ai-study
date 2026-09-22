import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import dotenv from 'dotenv';
import path from 'node:path';

// Carrega .env da raiz do projeto ou da pasta site
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '3000', 10),
  },
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      themes: {
        mocha: 'catppuccin-mocha',
        tokyo: 'tokyo-night',
        dracula: 'dracula',
        onedark: 'one-dark-pro',
        monokai: 'monokai',
      },
      defaultColor: false,
    },
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [rehypeKatex],
    }),
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      fs: {
        allow: ['..'],
      },
    },
  },
});
