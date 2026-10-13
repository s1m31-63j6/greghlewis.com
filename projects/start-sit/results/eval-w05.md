# Week 5 evaluation

Actuals: 15 games; built 2026-10-13T19:59+00:00.

## Snapshots
| snapshot | built (UTC) | priced | points MAE (PPR) | bias | inside p20–p80 |
|---|---|---|---|---|---|
| daily e080c7b | 2026-10-07T17:16 | 322 | 5.319 | +0.771 | 0.41 |
| daily 0a211c7 | 2026-10-08T17:12 | 376 | 5.419 | +1.264 | 0.426 |
| daily 4d29943 | 2026-10-09T16:49 | 347 | 5.106 | +1.176 | 0.43 |
| daily 9271d44 | 2026-10-10T15:43 | 347 | 5.227 | +1.421 | 0.44 |
| final 6519fac | 2026-10-11T16:09 | 353 | 4.965 | +1.1 | 0.411 |

## Final snapshot (6519fac, 2026-10-11T16:09 UTC)

### Who predicted best (full PPR, MAE / bias)

| pos | ours | books' fantasy line | 2025 avg | pick'em only |
|---|---|---|---|---|
| QB | 6.821 / +2.576 (n=25) | — (n=0) | 7.049 / +0.513 (n=18) | — (n=0) |
| RB | 5.745 / +0.886 (n=31) | — (n=0) | 7.264 / +0.54 (n=28) | — (n=0) |
| WR | 4.969 / +1.061 (n=75) | — (n=0) | 5.331 / +0.356 (n=63) | — (n=3) |
| TE | 5.224 / +0.753 (n=37) | — (n=0) | 5.808 / -0.006 (n=35) | — (n=0) |

### Per stat

| stat | n | MAE | bias | share over the line |
|---|---|---|---|---|
| pass_yds | 28 | 53.285 | -1.263 | 0.536 |
| pass_tds | 28 | 0.805 | +0.214 | 0.429 |
| ints | 28 | 0.619 | +0.044 | 0.357 |
| rush_yds | 76 | 19.634 | +4.177 | 0.434 |
| rush_att | 55 | 3.366 | +0.34 | 0.527 |
| rec | 154 | 1.471 | +0.179 | 0.494 |
| rec_yds | 154 | 20.371 | +3.688 | 0.468 |

### Touchdowns (n=293): Brier 0.124 scaled vs 0.121 raw; scored 0.191 vs predicted 0.169 scaled / 0.198 raw

- p 0.00–0.20: n=189, predicted 0.086, scored 0.085
- p 0.20–0.35: n=68, predicted 0.256, scored 0.25
- p 0.35–0.50: n=26, predicted 0.403, scored 0.615
- p 0.50–0.65: n=9, predicted 0.529, scored 0.667

### Verdict calibration: 4206 same-position pairs, favorite won 0.664, Brier of P(A>B) 0.22

- gap 0–1: n=684, favorite won 0.52 (mean P(A>B) 0.545)
- gap 1–2: n=616, favorite won 0.545 (mean P(A>B) 0.629)
- gap 2–3: n=550, favorite won 0.604 (mean P(A>B) 0.695)
- gap 3–5: n=930, favorite won 0.645 (mean P(A>B) 0.77)
- gap 5–∞: n=1426, favorite won 0.818 (mean P(A>B) 0.888)
- suggested minimum gap for a call: {'minGap': 2, 'hitRate': 0.604, 'n': 550}

### Per book, MAE of the posted line

| book | all | pass_yds | pass_tds | ints | rush_yds | rush_att | rec | rec_yds |
|---|---|---|---|---|---|---|---|---|
| sleeper | 6.891 (n=23) | — | — | — | — | — | — | — |
| draftkings | 11.036 (n=444) | 60.605 | 0.857 | 0.643 | 18.466 | 3.351 | 1.554 | 19.226 |
| caesars | 11.393 (n=412) | — | 0.923 | 0.654 | 18.267 | 3.449 | 1.547 | 21.279 |
| bovada | 11.774 (n=424) | 57.45 | 0.857 | 0.648 | 22.5 | 3.378 | 1.576 | 20.42 |
| espnbet | 12.204 (n=463) | 49.083 | 0.857 | 0.643 | 19.828 | 3.409 | 1.542 | 21.294 |
| betmgm | 12.816 (n=364) | 56.794 | 0.929 | 0.682 | 20.7 | 3.868 | 1.616 | 20.41 |
| fanduel | 13.858 (n=444) | 53.464 | 0.923 | — | 19.5 | 3.35 | 1.609 | 20.355 |

### The week: bias +1.1 points per player (actual − projected), MAE 4.965

Hot:
- Drake Maye (QB NE): projected 19.2, actual 39.5 (+20.3)
- Christian Watson (WR GB): projected 10.5, actual 29.3 (+18.8)
- Jaylen Warren (RB PIT): projected 15.0, actual 33.8 (+18.8)
- Isaiah Likely (TE NYG): projected 8.3, actual 26.9 (+18.6)
- DeMario Douglas (WR NE): projected 5.1, actual 20.5 (+15.4)
- Jameis Winston (QB NYG): projected 12.4, actual 27.7 (+15.4)
- Kyle Williams (WR NE): projected 2.6, actual 16.6 (+14.0)
- Malik Nabers (WR NYG): projected 10.0, actual 23.6 (+13.6)
- Pat Freiermuth (TE PIT): projected 5.7, actual 19.0 (+13.3)
- Jayden Daniels (QB WSH): projected 17.2, actual 30.3 (+13.0)

Cold:
- Tyler Shough (QB NO): projected 16.0, actual 1.8 (-14.2)
- Tyson Bagent (QB CHI): projected 15.9, actual 3.2 (-12.8)
- Michael Wilson (WR ARI): projected 13.7, actual 5.3 (-8.5)
- Dalton Kincaid (TE BUF): projected 9.5, actual 1.2 (-8.3)
- Jeremiyah Love (RB ARI): projected 10.3, actual 2.2 (-8.1)
- David Montgomery (RB HOU): projected 8.7, actual 1.1 (-7.6)
- Alvin Kamara (RB NO): projected 9.0, actual 1.6 (-7.4)
- Chase Brown (RB CIN): projected 14.9, actual 7.5 (-7.4)
- T.J. Hockenson (TE MIN): projected 8.3, actual 1.2 (-7.1)
- Roman Wilson (WR PIT): projected 7.1, actual 0.0 (-7.1)
