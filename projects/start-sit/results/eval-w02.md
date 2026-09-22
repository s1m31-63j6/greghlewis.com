# Week 2 evaluation

Actuals: 16 games; built 2026-09-22T14:03+00:00.

## Snapshots
| snapshot | built (UTC) | priced | points MAE (PPR) | bias | inside p20–p80 |
|---|---|---|---|---|---|
| daily b57be40 | 2026-09-16T13:04 | 265 | 7.122 | +1.252 | 0.433 |
| daily 1d4bacb | 2026-09-17T10:12 | 399 | 5.395 | +0.811 | 0.429 |
| daily 2697cb2 | 2026-09-18T10:12 | 378 | 4.759 | +0.323 | 0.5 |
| daily 7a0ae7d | 2026-09-19T10:10 | 389 | 4.562 | +0.042 | 0.497 |
| daily a6e68e2 | 2026-09-20T10:10 | 395 | 4.599 | +0.077 | 0.485 |
| final d71a39d | 2026-09-20T15:32 | 395 | 4.594 | +0.093 | 0.49 |

## Final snapshot (d71a39d, 2026-09-20T15:32 UTC)

### Who predicted best (full PPR, MAE / bias)

| pos | ours | books' fantasy line | 2025 avg | pick'em only |
|---|---|---|---|---|
| QB | 6.146 / -0.631 (n=26) | — (n=0) | 6.979 / -1.718 (n=21) | — (n=0) |
| RB | 3.969 / -1.254 (n=36) | — (n=0) | 4.819 / -1.908 (n=32) | — (n=0) |
| WR | 5.395 / +1.055 (n=77) | — (n=0) | 5.95 / +0.763 (n=69) | — (n=0) |
| TE | 4.742 / +0.329 (n=35) | — (n=0) | 4.678 / -0.961 (n=33) | — (n=0) |

### Per stat

| stat | n | MAE | bias | share over the line |
|---|---|---|---|---|
| pass_yds | 30 | 62.593 | -4.183 | 0.5 |
| pass_tds | 30 | 0.913 | +0.063 | 0.4 |
| ints | 30 | 0.612 | +0.101 | 0.467 |
| rush_yds | 83 | 16.95 | -3.306 | 0.337 |
| rush_att | 63 | 3.232 | -0.723 | 0.365 |
| rec | 159 | 1.518 | +0.226 | 0.478 |
| rec_yds | 159 | 20.78 | +4.223 | 0.472 |

### Touchdowns (n=317): Brier 0.114 scaled vs 0.118 raw; scored 0.139 vs predicted 0.173 scaled / 0.207 raw

- p 0.00–0.20: n=200, predicted 0.093, scored 0.07
- p 0.20–0.35: n=87, predicted 0.261, scored 0.23
- p 0.35–0.50: n=22, predicted 0.411, scored 0.364
- p 0.50–0.65: n=8, predicted 0.557, scored 0.25

### Verdict calibration: 4476 same-position pairs, favorite won 0.66, Brier of P(A>B) 0.22

- gap 0–1: n=871, favorite won 0.537 (mean P(A>B) 0.535)
- gap 1–2: n=765, favorite won 0.557 (mean P(A>B) 0.61)
- gap 2–3: n=737, favorite won 0.655 (mean P(A>B) 0.675)
- gap 3–5: n=1127, favorite won 0.687 (mean P(A>B) 0.755)
- gap 5–∞: n=976, favorite won 0.823 (mean P(A>B) 0.862)
- suggested minimum gap for a call: {'minGap': 2, 'hitRate': 0.655, 'n': 737}

### Per book, MAE of the posted line

| book | all | pass_yds | pass_tds | ints | rush_yds | rush_att | rec | rec_yds |
|---|---|---|---|---|---|---|---|---|
| sleeper | 7.938 (n=32) | — | — | — | — | — | — | — |
| draftkings | 11.392 (n=461) | 55.152 | 1.0 | 0.6 | 17.828 | 3.346 | 1.607 | 20.983 |
| caesars | 11.639 (n=467) | 52.455 | 1.017 | 0.6 | 16.045 | 3.372 | 1.626 | 21.415 |
| bovada | 11.659 (n=427) | 70.5 | 1.0 | 0.6 | 16.395 | 3.589 | 1.608 | 23.031 |
| betmgm | 11.773 (n=400) | 60.389 | 1.033 | 0.63 | 18.763 | 3.65 | 1.545 | 18.727 |
| espnbet | 13.014 (n=496) | 65.833 | 1.067 | 0.6 | 16.711 | 3.265 | 1.555 | 21.794 |
| fanduel | 13.685 (n=476) | 66.981 | 1.067 | — | 16.98 | 3.231 | 1.587 | 20.948 |

### The week: bias +0.093 points per player (actual − projected), MAE 4.594

Hot:
- Davante Adams (WR LAR): projected 10.3, actual 35.5 (+25.2)
- Jaxon Smith-Njigba (WR SEA): projected 14.0, actual 38.0 (+24.0)
- CeeDee Lamb (WR DAL): projected 13.5, actual 31.3 (+17.8)
- Tre Tucker (WR LV): projected 6.8, actual 20.4 (+13.6)
- Darren Waller (TE CAR): projected 3.7, actual 16.8 (+13.1)
- Jake Ferguson (TE DAL): projected 5.8, actual 18.3 (+12.5)
- Denzel Boston (WR CLE): projected 5.7, actual 18.0 (+12.3)
- DeVonta Smith (WR PHI): projected 10.4, actual 22.7 (+12.3)
- Travis Kelce (TE KC): projected 8.4, actual 20.6 (+12.2)
- Jonathan Taylor (RB IND): projected 15.2, actual 27.2 (+12.0)

Cold:
- Jaxson Dart (QB NYG): projected 17.1, actual 0.8 (-16.3)
- Saquon Barkley (RB PHI): projected 13.6, actual 2.5 (-11.1)
- Bijan Robinson (RB ATL): projected 20.3, actual 9.6 (-10.7)
- Malik Nabers (WR NYG): projected 11.2, actual 0.6 (-10.6)
- Caleb Williams (QB CHI): projected 18.6, actual 8.7 (-9.9)
- Trevor Lawrence (QB JAX): projected 16.5, actual 7.2 (-9.3)
- David Montgomery (RB HOU): projected 12.6, actual 3.4 (-9.2)
- Drake Maye (QB NE): projected 18.2, actual 9.0 (-9.1)
- Colston Loveland (TE CHI): projected 9.4, actual 0.8 (-8.6)
- Javonte Williams (RB DAL): projected 15.1, actual 6.5 (-8.6)
