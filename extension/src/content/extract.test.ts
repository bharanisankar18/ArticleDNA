import { beforeEach, describe, expect, it } from 'vitest';
import { blockText, cleanAuthor, extractArticle } from './extract';

const paragraph = (n: number) =>
  `<p>Paragraph ${n}. Researchers measured reading comprehension across 1,200 participants and found that structured summaries improved recall by a meaningful margin, especially for long technical texts that readers had never seen before.</p>`;

function loadPage(html: string) {
  document.open();
  document.write(html);
  document.close();
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('extractArticle', () => {
  it('extracts the article body, metadata and word count, without navigation or ads', () => {
    loadPage(`<!doctype html><html lang="en"><head>
      <title>Structured summaries improve recall | Example Science</title>
      <meta property="og:site_name" content="Example Science">
      <meta name="author" content="Dana Reyes">
      <meta property="article:published_time" content="2026-03-04T09:00:00Z">
      </head><body>
      <nav><a href="/">Home</a><a href="/news">News</a><a href="/subscribe">Subscribe now</a></nav>
      <div class="ad">BUY CHEAP WIDGETS TODAY</div>
      <article>
        <h1>Structured summaries improve recall</h1>
        ${Array.from({ length: 8 }, (_, i) => paragraph(i + 1)).join('')}
      </article>
      <footer>Copyright Example Science. All rights reserved.</footer>
      </body></html>`);

    const result = extractArticle(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.article;
    expect(a.title).toContain('Structured summaries improve recall');
    expect(a.author).toBe('Dana Reyes');
    expect(a.publishedDate).toBe('2026-03-04');
    expect(a.siteName).toBe('Example Science');
    expect(a.language).toBe('en');
    expect(a.content).toContain('Paragraph 1.');
    expect(a.content).toContain('Paragraph 8.');
    expect(a.content).not.toContain('BUY CHEAP WIDGETS');
    expect(a.content).not.toContain('Subscribe now');
    expect(a.wordCount).toBeGreaterThan(250);
    expect(a.method).toBe('readability');
  });

  it('reads scholarly citation metadata', () => {
    loadPage(`<!doctype html><html><head><title>Paper</title>
      <meta name="citation_title" content="A Study of Things">
      <meta name="citation_author" content="Ada Lovelace">
      <meta name="citation_author" content="Alan Turing">
      <meta name="citation_publication_date" content="2025/11/02">
      </head><body><main>${Array.from({ length: 6 }, (_, i) => paragraph(i)).join('')}</main></body></html>`);
    const result = extractArticle(document);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.article.author).toBe('Ada Lovelace, Alan Turing');
      expect(result.article.publishedDate).toBe('2025-11-02');
    }
  });

  it('fails gracefully on a page with no text', () => {
    loadPage('<!doctype html><html><head><title>Empty</title></head><body><img src="x.png"></body></html>');
    const result = extractArticle(document);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('empty');
  });

  it('recognises a PDF viewer page', () => {
    loadPage('<!doctype html><html><body><embed type="application/pdf" src="paper.pdf"></body></html>');
    const result = extractArticle(document);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('pdf');
  });
});

describe('cleanAuthor', () => {
  it('rejects bylines that are not names', () => {
    expect(cleanAuthor('[Submitted on 4 Feb 2025]')).toBeNull();
    expect(cleanAuthor('Published 12 March 2026')).toBeNull();
  });
  it('drops affiliations and prefixes', () => {
    expect(cleanAuthor('By Yuge Tu Affiliation: Modelbest Inc.')).toBe('Yuge Tu');
    expect(cleanAuthor('Authors: Ada Lovelace')).toBe('Ada Lovelace');
  });
  it('shortens very long author lists instead of dropping them', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => `Person${'abcdefghijklmnopqrst'[i]} Surname`).join(', ');
    expect(cleanAuthor(twenty)).toBe('Persona Surname, Personb Surname, Personc Surname et al.');
  });
  it('shortens long author lists', () => {
    expect(cleanAuthor('Loubna Ben Allal, Anton Lozhkov, Elie Bakouch, Gabriel Martín Blázquez')).toBe(
      'Loubna Ben Allal, Anton Lozhkov, Elie Bakouch et al.',
    );
  });
});

describe('blockText', () => {
  it('puts block elements on separate paragraphs and skips scripts', () => {
    const div = document.createElement('div');
    div.innerHTML = '<h2>Title</h2><p>One <b>bold</b> line.</p><script>alert(1)</script><ul><li>First</li><li>Second</li></ul>';
    expect(blockText(div)).toBe('Title\n\nOne bold line.\n\n• First\n\n• Second');
  });
});
