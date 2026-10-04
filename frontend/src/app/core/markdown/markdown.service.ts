import { Injectable, inject } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';

import type { ResolvedTheme } from '../platform/models';

/**
 * The syntax theme, one per palette, both built on CSS custom properties.
 *
 * The highlighter is given a theme whose colours are variable references
 * (var(--syntax-token-keyword) and so on) rather than literal values, and the
 * token layer defines those variables for each palette. That keeps every
 * syntax colour in the same file, measured against the same code background
 * token as everything else, and lets a theme switch recolour a block that is
 * already on screen without highlighting it again.
 *
 * The two entries differ only in name, which shiki writes into the block's
 * class; the palette a block shows is decided by the document's data-theme,
 * so a code block can never end up light inside a dark page.
 */
const SYNTAX_THEME: Record<ResolvedTheme, { name: string; variablePrefix: string }> = {
  light: { name: 'proof-light', variablePrefix: '--syntax-' },
  dark: { name: 'proof-dark', variablePrefix: '--syntax-' },
};

/**
 * Turns lesson and post markdown into markup that is safe to insert.
 *
 * Sanitization here is a second layer, not the first: the server sanitizes on
 * write, before anything is persisted. It is still done, because the value of
 * a second layer is that it holds when the first one is wrong, and because
 * this layer is the one that sees content after a markdown renderer has
 * expanded it — including whatever a future renderer decides to let through.
 *
 * The result is marked trusted only after it has been sanitized, and only
 * because the framework's own sanitizer strips the inline styles the syntax
 * highlighter emits, which would leave every code block unstyled. The order is
 * load-bearing: sanitize, then trust. Never the reverse, and never one without
 * the other.
 */
@Injectable({ providedIn: 'root' })
export class MarkdownService {
  private readonly sanitizer = inject(DomSanitizer);

  /**
   * Renders markdown to sanitized HTML text.
   *
   * Returned as a string rather than as trusted markup so that this method can
   * be asserted on directly: a test can read what survived sanitization
   * instead of unwrapping a framework value.
   */
  async render(markdown: string, theme: ResolvedTheme): Promise<string> {
    const highlighted = new Map<string, string>();
    const renderer = new Marked({
      async: true,
      walkTokens: async (token) => {
        if (token.type !== 'code') {
          return;
        }
        const code = token as Tokens.Code;
        const key = cacheKey(code.lang ?? '', code.text);
        if (!highlighted.has(key)) {
          highlighted.set(key, await this.highlight(code.text, code.lang ?? '', theme));
        }
      },
      renderer: {
        code(token: Tokens.Code): string {
          const html =
            highlighted.get(cacheKey(token.lang ?? '', token.text)) ?? plainCodeBlock(token.text);
          // Two different things arrive here as fenced blocks: source someone
          // wrote, and a transcript of what a tool printed back. The wrapper
          // is the only signal the stylesheet gets to tell them apart, so a
          // diagnostic can be drawn as evidence rather than as another
          // listing. It goes around the finished markup rather than around
          // the cached value, so what is cached stays the plain highlighting
          // of one block of text, reusable whatever frames it.
          return quotesToolOutput(token.lang) ? `<div class="lesson-output">${html}</div>` : html;
        },
        /**
         * Body headings are shifted down one level so that they nest under the
         * heading of the page they are rendered into, instead of competing
         * with it. A post whose source begins with `# Title` would otherwise
         * put a second first-level heading on a screen that already has one,
         * and a document with two of them has no single answer to "what is
         * this page about".
         */
        heading(token: Tokens.Heading): string {
          const level = Math.min(token.depth + 1, 6);
          return `<h${level}>${this.parser.parseInline(token.tokens)}</h${level}>\n`;
        },
      },
    });

    const html = await renderer.parse(markdown);
    return this.sanitize(html);
  }

  /**
   * Highlights one code example.
   *
   * Example source is opaque text, not markup: it is never HTML-sanitized by
   * the server and must not reach the DOM as markup. The highlighter escapes
   * it, and if the highlighter is unavailable the fallback escapes it by hand
   * — there is no path here where raw source is written into the document.
   */
  async highlight(code: string, language: string, theme: ResolvedTheme): Promise<string> {
    try {
      // Loaded on demand: the highlighter carries grammars and themes that no
      // screen except a lesson needs, and pulling them into the initial bundle
      // would make the first paint wait for them.
      const shiki = await import('shiki');
      return await shiki.codeToHtml(code, {
        lang: language || 'text',
        theme: shiki.createCssVariablesTheme(SYNTAX_THEME[theme]),
      });
    } catch {
      // An unknown language, or a highlighter that could not be loaded at all.
      // Neither is a reason to fail a lesson: the code is still readable, it
      // is simply not coloured.
      return plainCodeBlock(code);
    }
  }

  /** Sanitized markup, ready for insertion. */
  async renderTrusted(markdown: string, theme: ResolvedTheme): Promise<SafeHtml> {
    return this.sanitizer.bypassSecurityTrustHtml(await this.render(markdown, theme));
  }

  /** Sanitized markup for a single highlighted example. */
  async highlightTrusted(code: string, language: string, theme: ResolvedTheme): Promise<SafeHtml> {
    return this.sanitizer.bypassSecurityTrustHtml(
      await this.highlightSanitized(code, language, theme),
    );
  }

  /**
   * Sanitized markup for one highlighted listing, as a string.
   *
   * The string counterpart to `highlightTrusted`, for the one caller that
   * inserts the result itself instead of through an `[innerHTML]` binding:
   * the daily puzzle takes the highlighter's per-line spans apart and rehomes
   * them into its own selectable rows, which needs nodes rather than a
   * framework-trusted value. Sanitizing here keeps that caller on the same
   * order as every other one — sanitize, then insert — rather than leaving it
   * to reach for the unsanitized `highlight` output and get the order wrong.
   */
  async highlightSanitized(code: string, language: string, theme: ResolvedTheme): Promise<string> {
    return this.sanitize(await this.highlight(code, language, theme));
  }

  private sanitize(html: string): string {
    return DOMPurify.sanitize(html, {
      // Neither has any legitimate use in a lesson body, and both are the
      // usual carriers when one does appear.
      FORBID_TAGS: ['style', 'form'],
      FORBID_ATTR: ['srcset', 'formaction'],
    });
  }
}

/**
 * Whether a fence quotes output a tool actually produced — a compiler
 * diagnostic, a program's stdout — rather than source an author wrote.
 *
 * The convention comes from the content format: a quoted transcript carries no
 * language tag, or the tag `text`, precisely so that it is not coloured like
 * code. There is nothing to highlight in a stack trace, and highlighting it
 * anyway would dress up evidence as a listing.
 *
 * The match is exact rather than a substring test, because a tag like
 * `plaintext` names a real grammar the highlighter knows and must be left to
 * it.
 */
function quotesToolOutput(language: string | undefined): boolean {
  const tag = (language ?? '').trim().toLowerCase();
  return tag === '' || tag === 'text';
}

function cacheKey(language: string, code: string): string {
  return `${language} ${code}`;
}

function plainCodeBlock(code: string): string {
  return `<pre class="code-block"><code>${escapeHtml(code)}</code></pre>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
