import { describe, expect, it } from 'vitest';
import { matchQuote, normalizeForMatch } from './textMatch';

const ARTICLE = normalizeForMatch(`
  Remote work has permanently changed how cities grow. In a survey of 2,400 employers conducted in
  March, 61 percent said they now allow employees to work from home at least three days a week.
  "Office vacancy in the ten largest metros reached 19.6 percent this spring, the highest level ever
  recorded," the report notes. Smaller towns, meanwhile, are seeing an influx of residents who keep
  big-city jobs. Critics say the trend is temporary and that companies will call workers back once
  leases are renegotiated.
`);

describe('normalizeForMatch', () => {
  it('keeps only letters and digits, lower-cased', () => {
    expect(normalizeForMatch('It’s  “Fine” — 19.6%!')).toBe('itsfine196');
  });
  it('folds compatibility characters', () => {
    expect(normalizeForMatch('ﬁnal')).toBe('final');
  });
});

describe('matchQuote', () => {
  it('finds a verbatim quote despite typography and whitespace differences', () => {
    const r = matchQuote(ARTICLE, '“Office vacancy in the ten largest metros reached 19.6 percent this spring”');
    expect(r.status).toBe('exact');
  });

  it('matches elided quotes piecewise, in order', () => {
    const r = matchQuote(ARTICLE, 'Remote work has permanently changed … how cities grow');
    expect(r.status).toBe('exact');
    if (r.status === 'exact') expect(r.spans).toHaveLength(2);
    expect(matchQuote(ARTICLE, 'how cities grow … Remote work has permanently').status).toBe('not_found');
  });

  it('reports a lightly reworded quote as approximate, never exact', () => {
    const reworded =
      'Smaller towns, meanwhile, are seeing a wave of residents who keep big-city jobs. Critics say the trend is temporary and that companies will call workers back';
    const r = matchQuote(ARTICLE, reworded);
    expect(r.status).toBe('approximate');
  });

  it('does not invent a match for a fabricated passage', () => {
    expect(matchQuote(ARTICLE, 'Thousands of firms have already terminated their office leases this year.').status).toBe(
      'not_found',
    );
  });

  it('rejects quotes too short to be meaningful', () => {
    expect(matchQuote(ARTICLE, 'cities').status).toBe('not_found');
    expect(matchQuote(ARTICLE, '').status).toBe('not_found');
  });

  it('does not stitch together words scattered across the page', () => {
    const scattered = 'Remote work critics say smaller towns reached the highest level of employers ever recorded in March';
    expect(matchQuote(ARTICLE, scattered).status).toBe('not_found');
  });
});
