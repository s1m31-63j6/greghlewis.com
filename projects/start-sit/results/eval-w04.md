# Week 4 evaluation

Actuals: 16 games; built 2026-10-06T14:03+00:00.

## Snapshots
| snapshot | built (UTC) | priced | points MAE (PPR) | bias | inside p20–p80 |
|---|---|---|---|---|---|
| daily 0eb0aed | 2026-10-01T10:12 | 408 | 5.056 | +1.268 | 0.485 |
| daily b0e3708 | 2026-10-02T16:07 | 385 | 4.911 | +0.997 | 0.443 |
| daily ff9de07 | 2026-10-03T14:00 | 383 | 4.961 | +1.04 | 0.449 |
| daily feb51cb | 2026-10-03T14:34 | 383 | 4.99 | +1.088 | 0.451 |
| final f766a6c | 2026-10-04T15:09 | 382 | 4.872 | +1.25 | 0.452 |
| final 1014863 | 2026-10-04T16:57 | 351 | 4.919 | +1.29 | 0.455 |

## Final snapshot (1014863, 2026-10-04T16:57 UTC)

### Who predicted best (full PPR, MAE / bias)

| pos | ours | books' fantasy line | 2025 avg | pick'em only |
|---|---|---|---|---|
| QB | 3.738 / -0.726 (n=26) | — (n=0) | 4.134 / -0.933 (n=22) | — (n=0) |
| RB | 6.882 / +2.22 (n=39) | — (n=0) | 7.703 / +2.657 (n=36) | — (n=0) |
| WR | 6.113 / +2.073 (n=79) | — (n=0) | 6.121 / +1.494 (n=71) | — (n=0) |
| TE | 4.286 / +1.059 (n=40) | — (n=0) | 4.706 / +0.306 (n=37) | — (n=0) |

### Per stat

| stat | n | MAE | bias | share over the line |
|---|---|---|---|---|
| pass_yds | 28 | 57.655 | +17.041 | 0.536 |
| pass_tds | 28 | 0.708 | -0.004 | 0.536 |
| ints | 28 | 0.736 | +0.216 | 0.464 |
| rush_yds | 83 | 18.152 | +1.095 | 0.386 |
| rush_att | 64 | 3.236 | -0.131 | 0.5 |
| rec | 169 | 1.733 | +0.495 | 0.521 |
| rec_yds | 168 | 23.385 | +8.007 | 0.536 |

### Touchdowns (n=293): Brier 0.134 scaled vs 0.134 raw; scored 0.191 vs predicted 0.18 scaled / 0.209 raw

- p 0.00–0.20: n=181, predicted 0.09, scored 0.094
- p 0.20–0.35: n=70, predicted 0.255, scored 0.286
- p 0.35–0.50: n=32, predicted 0.404, scored 0.438
- p 0.50–0.65: n=9, predicted 0.548, scored 0.444

### Verdict calibration: 4927 same-position pairs, favorite won 0.658, Brier of P(A>B) 0.227

- gap 0–1: n=744, favorite won 0.516 (mean P(A>B) 0.547)
- gap 1–2: n=696, favorite won 0.57 (mean P(A>B) 0.621)
- gap 2–3: n=634, favorite won 0.609 (mean P(A>B) 0.692)
- gap 3–5: n=1070, favorite won 0.687 (mean P(A>B) 0.771)
- gap 5–∞: n=1783, favorite won 0.75 (mean P(A>B) 0.89)
- suggested minimum gap for a call: {'minGap': 2, 'hitRate': 0.609, 'n': 634}

### Per book, MAE of the posted line

| book | all | pass_yds | pass_tds | ints | rush_yds | rush_att | rec | rec_yds |
|---|---|---|---|---|---|---|---|---|
| sleeper | 7.972 (n=36) | — | — | — | — | — | — | — |
| bovada | 11.637 (n=446) | 55.029 | 0.759 | 0.722 | 16.268 | 3.868 | 1.793 | 23.185 |
| draftkings | 12.555 (n=458) | 58.206 | 0.759 | 0.722 | 21.873 | 3.479 | 1.772 | 24.451 |
| caesars | 13.028 (n=464) | 69.382 | 0.722 | 0.722 | 17.938 | 3.458 | 1.784 | 24.425 |
| betmgm | 13.288 (n=401) | 45.375 | 0.722 | 0.731 | 19.886 | 3.167 | 1.873 | 25.386 |
| espnbet | 13.824 (n=497) | 55.34 | 0.722 | 0.722 | 18.513 | 3.804 | 1.831 | 24.755 |
| fanduel | 14.473 (n=484) | 58.611 | 0.722 | — | 17.855 | 3.5 | 1.788 | 23.724 |

### The week: bias +1.29 points per player (actual − projected), MAE 4.919

Hot:
- Tetairoa McMillan (WR CAR): projected 12.1, actual 38.2 (+26.1)
- Tyquan Thornton (WR KC): projected 4.0, actual 25.6 (+21.6)
- Kyle Monangai (RB CHI): projected 7.1, actual 27.5 (+20.4)
- Kyren Williams (RB LAR): projected 11.8, actual 31.7 (+19.9)
- CeeDee Lamb (WR DAL): projected 13.3, actual 32.8 (+19.5)
- Keon Coleman (WR BUF): projected 3.1, actual 20.6 (+17.5)
- Emanuel Wilson (RB SEA): projected 8.9, actual 25.5 (+16.6)
- Javonte Williams (RB DAL): projected 12.4, actual 28.8 (+16.4)
- Nico Collins (WR HOU): projected 12.5, actual 27.3 (+14.8)
- Romeo Doubs (WR NE): projected 7.1, actual 20.8 (+13.7)

Cold:
- Ja'Marr Chase (WR CIN): projected 15.8, actual 4.2 (-11.6)
- Parker Washington (WR JAX): projected 13.0, actual 1.5 (-11.5)
- Saquon Barkley (RB PHI): projected 12.8, actual 1.5 (-11.3)
- Garrett Wilson (WR NYJ): projected 13.5, actual 4.2 (-9.3)
- Ladd McConkey (WR LAC): projected 8.3, actual 0.0 (-8.3)
- Kenyon Sadiq (TE NYJ): projected 8.2, actual 0.0 (-8.2)
- Malik Willis (QB MIA): projected 12.7, actual 4.5 (-8.2)
- Jeremiyah Love (RB ARI): projected 14.1, actual 6.0 (-8.0)
- Dalton Kincaid (TE BUF): projected 8.9, actual 1.2 (-7.7)
- DJ Moore (WR BUF): projected 9.3, actual 2.2 (-7.1)
