# Week 3 evaluation

Actuals: 16 games; built 2026-09-29T14:03+00:00.

## Snapshots
| snapshot | built (UTC) | priced | points MAE (PPR) | bias | inside p20–p80 |
|---|---|---|---|---|---|
| daily 0065a39 | 2026-09-24T10:12 | 368 | 4.539 | +0.322 | 0.503 |
| daily ab8fe29 | 2026-09-25T10:12 | 379 | 4.513 | +0.797 | 0.497 |
| daily d0e18f1 | 2026-09-26T10:10 | 378 | 4.564 | +0.833 | 0.46 |
| daily 187fc1f | 2026-09-27T10:11 | 394 | 4.693 | +1.104 | 0.452 |
| final d260bc1 | 2026-09-27T15:34 | 393 | 4.661 | +1.023 | 0.452 |

## Final snapshot (d260bc1, 2026-09-27T15:34 UTC)

### Who predicted best (full PPR, MAE / bias)

| pos | ours | books' fantasy line | 2025 avg | pick'em only |
|---|---|---|---|---|
| QB | 5.495 / +1.859 (n=26) | — (n=0) | 6.338 / +1.942 (n=22) | — (n=0) |
| RB | 5.131 / +0.04 (n=33) | — (n=0) | 6.028 / -0.82 (n=31) | — (n=0) |
| WR | 4.571 / +0.988 (n=82) | — (n=0) | 4.857 / +0.57 (n=70) | — (n=0) |
| TE | 6.416 / +1.824 (n=38) | — (n=0) | 5.364 / +0.576 (n=37) | — (n=0) |

### Per stat

| stat | n | MAE | bias | share over the line |
|---|---|---|---|---|
| pass_yds | 29 | 45.504 | +11.404 | 0.621 |
| pass_tds | 29 | 1.029 | +0.49 | 0.552 |
| ints | 29 | 0.66 | +0.248 | 0.586 |
| rush_yds | 81 | 16.068 | +3.196 | 0.494 |
| rush_att | 58 | 2.764 | +0.507 | 0.552 |
| rec | 166 | 1.613 | +0.166 | 0.44 |
| rec_yds | 167 | 19.306 | +4.337 | 0.509 |

### Touchdowns (n=318): Brier 0.142 scaled vs 0.144 raw; scored 0.189 vs predicted 0.174 scaled / 0.206 raw

- p 0.00–0.20: n=198, predicted 0.091, scored 0.126
- p 0.20–0.35: n=84, predicted 0.255, scored 0.262
- p 0.35–0.50: n=29, predicted 0.415, scored 0.241

### Verdict calibration: 4877 same-position pairs, favorite won 0.662, Brier of P(A>B) 0.214

- gap 0–1: n=821, favorite won 0.521 (mean P(A>B) 0.539)
- gap 1–2: n=786, favorite won 0.566 (mean P(A>B) 0.621)
- gap 2–3: n=755, favorite won 0.62 (mean P(A>B) 0.686)
- gap 3–5: n=1163, favorite won 0.675 (mean P(A>B) 0.765)
- gap 5–∞: n=1352, favorite won 0.817 (mean P(A>B) 0.878)
- suggested minimum gap for a call: {'minGap': 2, 'hitRate': 0.62, 'n': 755}

### Per book, MAE of the posted line

| book | all | pass_yds | pass_tds | ints | rush_yds | rush_att | rec | rec_yds |
|---|---|---|---|---|---|---|---|---|
| sleeper | 9.0 (n=26) | — | — | — | — | — | — | — |
| draftkings | 9.773 (n=461) | 42.395 | 1.052 | 0.638 | 15.531 | 3.042 | 1.623 | 19.161 |
| caesars | 10.191 (n=459) | — | 1.052 | 0.638 | 16.054 | 3.189 | 1.613 | 20.461 |
| bovada | 10.775 (n=455) | 50.595 | 1.052 | 0.638 | 16.107 | 3.284 | 1.624 | 19.508 |
| espnbet | 11.34 (n=489) | 43.611 | 1.036 | 0.643 | 15.866 | 2.977 | 1.596 | 19.521 |
| betmgm | 12.086 (n=396) | 53.273 | 1.121 | 0.667 | 17.5 | 3.079 | 1.606 | 20.383 |
| fanduel | 12.261 (n=481) | 45.19 | 1.052 | — | 15.947 | 3.16 | 1.637 | 20.037 |

### The week: bias +1.023 points per player (actual − projected), MAE 4.661

Hot:
- Jahmyr Gibbs (RB DET): projected 20.6, actual 37.9 (+17.3)
- George Kittle (TE SF): projected 8.6, actual 23.2 (+14.6)
- Noah Fant (TE NO): projected 2.7, actual 17.3 (+14.6)
- Jaxon Smith-Njigba (WR SEA): projected 15.8, actual 30.4 (+14.6)
- Juwan Johnson (TE NO): projected 6.7, actual 21.3 (+14.6)
- Sam Darnold (QB SEA): projected 15.2, actual 29.7 (+14.5)
- Kenyon Sadiq (TE NYJ): projected 6.1, actual 20.0 (+13.9)
- Brock Bowers (TE LV): projected 8.8, actual 22.6 (+13.8)
- Kalif Raymond (WR CHI): projected 4.8, actual 18.0 (+13.2)
- Harold Fannin (TE CLE): projected 7.5, actual 20.6 (+13.1)

Cold:
- De'Von Achane (RB MIA): projected 13.9, actual 1.7 (-12.2)
- Drake Maye (QB NE): projected 17.4, actual 7.8 (-9.6)
- Justin Jefferson (WR MIN): projected 12.8, actual 4.2 (-8.6)
- Jonathan Taylor (RB IND): projected 16.3, actual 8.2 (-8.1)
- Tetairoa McMillan (WR CAR): projected 10.7, actual 2.7 (-8.0)
- Terrance Ferguson (TE LAR): projected 8.7, actual 1.4 (-7.3)
- Jalen Coker (WR CAR): projected 9.8, actual 2.8 (-7.0)
- Jaylen Waddle (WR DEN): projected 10.3, actual 3.4 (-6.9)
- Oronde Gadsden (TE LAC): projected 6.9, actual 0.0 (-6.9)
- Jadarian Price (RB SEA): projected 9.5, actual 2.7 (-6.8)
