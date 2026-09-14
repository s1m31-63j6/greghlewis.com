# Week 1 evaluation

Actuals: 15 games; built 2026-09-14T14:30+00:00.

## Snapshots
| snapshot | built (UTC) | priced | points MAE (PPR) | bias | inside p20–p80 |
|---|---|---|---|---|---|
| daily 169f76d | 2026-09-12T17:23 | 355 | 5.398 | +1.982 | 0.478 |
| daily 3518701 | 2026-09-12T17:30 | 355 | 5.399 | +1.985 | 0.472 |
| daily 7dd5a4a | 2026-09-13T10:17 | 368 | 5.319 | +1.934 | 0.467 |
| final d2a4ced | 2026-09-13T15:32 | 366 | 5.308 | +1.961 | 0.462 |

## Final snapshot (d2a4ced, 2026-09-13T15:32 UTC)

### Who predicted best (full PPR, MAE / bias)

| pos | ours | books' fantasy line | 2025 avg | pick'em only |
|---|---|---|---|---|
| QB | 7.021 / +3.35 (n=22) | 6.904 / +3.084 (n=22) | 6.918 / +4.315 (n=18) | — (n=0) |
| RB | 7.112 / +3.541 (n=34) | 7.203 / +4.027 (n=33) | 7.756 / +2.959 (n=31) | — (n=0) |
| WR | 5.097 / +1.22 (n=75) | 5.162 / +1.249 (n=71) | 6.025 / +0.572 (n=65) | — (n=0) |
| TE | 5.074 / +1.604 (n=33) | 4.945 / +1.558 (n=33) | 5.48 / +0.279 (n=33) | — (n=0) |

### Per stat

| stat | n | MAE | bias | share over the line |
|---|---|---|---|---|
| pass_yds | 26 | 61.625 | +10.935 | 0.538 |
| pass_tds | 26 | 0.903 | +0.32 | 0.577 |
| ints | 26 | 0.598 | +0.118 | 0.462 |
| rush_yds | 66 | 17.354 | +5.975 | 0.561 |
| rush_att | 66 | 3.138 | +0.553 | 0.5 |
| rec | 157 | 1.383 | +0.212 | 0.503 |
| rec_yds | 150 | 20.269 | +6.553 | 0.547 |

### Touchdowns (n=262): Brier 0.141 scaled vs 0.137 raw; scored 0.218 vs predicted 0.181 scaled / 0.215 raw

- p 0.00–0.20: n=159, predicted 0.094, scored 0.119
- p 0.20–0.35: n=70, predicted 0.258, scored 0.271
- p 0.35–0.50: n=27, predicted 0.403, scored 0.481

### Verdict calibration: 4095 same-position pairs, favorite won 0.655, Brier of P(A>B) 0.222

- gap 0–1: n=687, favorite won 0.505 (mean P(A>B) 0.541)
- gap 1–2: n=697, favorite won 0.544 (mean P(A>B) 0.618)
- gap 2–3: n=557, favorite won 0.636 (mean P(A>B) 0.682)
- gap 3–5: n=992, favorite won 0.7 (mean P(A>B) 0.766)
- gap 5–∞: n=1162, favorite won 0.781 (mean P(A>B) 0.88)
- suggested minimum gap for a call: {'minGap': 2, 'hitRate': 0.636, 'n': 557}

### Per book, MAE of the posted line

| book | all | pass_yds | pass_tds | ints | rush_yds | rush_att | rec | rec_yds |
|---|---|---|---|---|---|---|---|---|
| draftkings | 11.614 (n=422) | 62.0 | 0.923 | 0.615 | 14.293 | 3.439 | 1.431 | 20.259 |
| caesars | 11.785 (n=404) | 56.605 | 0.923 | 0.615 | 17.648 | 3.857 | 1.444 | 21.158 |
| bovada | 12.279 (n=434) | 57.7 | 0.923 | 0.615 | 16.944 | 3.686 | 1.469 | 20.233 |
| espnbet | 12.343 (n=433) | 57.543 | 0.94 | 0.58 | 17.045 | 3.256 | 1.523 | 20.958 |
| betmgm | 13.258 (n=327) | — | 0.94 | 0.559 | 16.44 | 3.042 | 1.461 | 22.606 |
| fanduel | 13.308 (n=416) | 62.58 | 0.94 | — | 16.531 | 3.542 | 1.431 | 20.435 |

### The week: bias +1.961 points per player (actual − projected), MAE 5.308

Hot:
- Jalen Coker (WR CAR): projected 7.4, actual 29.8 (+22.4)
- Derrick Henry (RB BAL): projected 13.9, actual 34.8 (+20.9)
- Christian Watson (WR GB): projected 9.9, actual 29.7 (+19.8)
- Caleb Williams (QB CHI): projected 17.6, actual 37.3 (+19.7)
- D'Andre Swift (RB CHI): projected 12.3, actual 31.9 (+19.6)
- Josh Allen (QB BUF): projected 18.7, actual 35.7 (+16.9)
- Isaiah Likely (TE NYG): projected 6.9, actual 23.8 (+16.9)
- Bryce Young (QB CAR): projected 15.6, actual 32.4 (+16.8)
- David Montgomery (RB HOU): projected 11.0, actual 27.4 (+16.4)
- Ashton Jeanty (RB LV): projected 14.7, actual 29.7 (+15.0)

Cold:
- Kyler Murray (QB MIN): projected 17.6, actual 0.6 (-17.0)
- Ja'Marr Chase (WR CIN): projected 16.1, actual 2.2 (-13.9)
- Colston Loveland (TE CHI): projected 10.1, actual 0.0 (-10.1)
- Jordan Addison (WR MIN): projected 7.6, actual 0.0 (-7.6)
- George Pickens (WR DAL): projected 11.6, actual 4.3 (-7.3)
- Kyle Pitts (TE ATL): projected 7.1, actual 0.0 (-7.1)
- De'Von Achane (RB MIA): projected 15.6, actual 8.6 (-7.0)
- Terry McLaurin (WR WSH): projected 8.7, actual 2.4 (-6.3)
- Rico Dowdle (RB PIT): projected 9.4, actual 3.1 (-6.3)
- Quentin Johnston (WR LAC): projected 8.5, actual 2.7 (-5.8)
