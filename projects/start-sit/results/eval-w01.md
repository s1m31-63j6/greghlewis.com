# Week 1 evaluation

Actuals: 16 games; built 2026-09-15T14:03+00:00.

## Snapshots
| snapshot | built (UTC) | priced | points MAE (PPR) | bias | inside p20–p80 |
|---|---|---|---|---|---|
| daily 169f76d | 2026-09-12T17:23 | 355 | 5.348 | +1.799 | 0.477 |
| daily 3518701 | 2026-09-12T17:30 | 355 | 5.349 | +1.802 | 0.467 |
| daily 7dd5a4a | 2026-09-13T10:17 | 368 | 5.275 | +1.76 | 0.462 |
| final d2a4ced | 2026-09-13T15:32 | 366 | 5.266 | +1.787 | 0.453 |

## Final snapshot (d2a4ced, 2026-09-13T15:32 UTC)

### Who predicted best (full PPR, MAE / bias)

| pos | ours | books' fantasy line | 2025 avg | pick'em only |
|---|---|---|---|---|
| QB | 7.022 / +3.034 (n=24) | — (n=0) | 6.809 / +3.476 (n=20) | — (n=0) |
| RB | 7.194 / +3.642 (n=37) | — (n=0) | 8.1 / +3.011 (n=34) | — (n=0) |
| WR | 5.105 / +0.802 (n=81) | — (n=0) | 6.1 / +0.008 (n=71) | — (n=0) |
| TE | 4.81 / +1.638 (n=37) | — (n=0) | 5.179 / +0.383 (n=37) | — (n=0) |

### Per stat

| stat | n | MAE | bias | share over the line |
|---|---|---|---|---|
| pass_yds | 28 | 62.116 | +5.261 | 0.5 |
| pass_tds | 28 | 0.87 | +0.313 | 0.571 |
| ints | 28 | 0.593 | +0.147 | 0.5 |
| rush_yds | 71 | 18.226 | +6.862 | 0.549 |
| rush_att | 72 | 3.138 | +0.539 | 0.486 |
| rec | 170 | 1.385 | +0.153 | 0.488 |
| rec_yds | 163 | 20.142 | +5.461 | 0.534 |

### Touchdowns (n=282): Brier 0.14 scaled vs 0.137 raw; scored 0.216 vs predicted 0.181 scaled / 0.215 raw

- p 0.00–0.20: n=171, predicted 0.095, scored 0.123
- p 0.20–0.35: n=76, predicted 0.258, scored 0.25
- p 0.35–0.50: n=28, predicted 0.401, scored 0.5

### Verdict calibration: 4848 same-position pairs, favorite won 0.653, Brier of P(A>B) 0.223

- gap 0–1: n=823, favorite won 0.502 (mean P(A>B) 0.541)
- gap 1–2: n=826, favorite won 0.547 (mean P(A>B) 0.618)
- gap 2–3: n=669, favorite won 0.634 (mean P(A>B) 0.684)
- gap 3–5: n=1173, favorite won 0.692 (mean P(A>B) 0.767)
- gap 5–∞: n=1357, favorite won 0.784 (mean P(A>B) 0.88)
- suggested minimum gap for a call: {'minGap': 2, 'hitRate': 0.634, 'n': 669}

### The week: bias +1.787 points per player (actual − projected), MAE 5.266

Hot:
- Jalen Coker (WR CAR): projected 7.4, actual 29.8 (+22.4)
- Derrick Henry (RB BAL): projected 13.9, actual 34.8 (+20.9)
- Christian Watson (WR GB): projected 9.9, actual 29.7 (+19.8)
- Caleb Williams (QB CHI): projected 17.6, actual 37.3 (+19.7)
- D'Andre Swift (RB CHI): projected 12.3, actual 31.9 (+19.6)
- Kenneth Walker (RB KC): projected 13.8, actual 32.6 (+18.8)
- Josh Allen (QB BUF): projected 18.7, actual 35.7 (+16.9)
- Isaiah Likely (TE NYG): projected 6.9, actual 23.8 (+16.9)
- Bryce Young (QB CAR): projected 15.6, actual 32.4 (+16.8)
- David Montgomery (RB HOU): projected 11.0, actual 27.4 (+16.4)

Cold:
- Kyler Murray (QB MIN): projected 17.6, actual 0.6 (-17.0)
- Ja'Marr Chase (WR CIN): projected 16.1, actual 2.2 (-13.9)
- Colston Loveland (TE CHI): projected 10.1, actual 0.0 (-10.1)
- Jaylen Waddle (WR DEN): projected 9.6, actual 0.7 (-8.9)
- Jordan Addison (WR MIN): projected 7.6, actual 0.0 (-7.6)
- Bo Nix (QB DEN): projected 15.9, actual 8.4 (-7.5)
- George Pickens (WR DAL): projected 11.6, actual 4.3 (-7.3)
- Kyle Pitts (TE ATL): projected 7.1, actual 0.0 (-7.1)
- De'Von Achane (RB MIA): projected 15.6, actual 8.6 (-7.0)
- Terry McLaurin (WR WSH): projected 8.7, actual 2.4 (-6.3)
