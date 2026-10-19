# Intro to Bond Yields

An explainer for greghlewis.com/projects/bond-yields: the 10-year and the
fed funds rate since 2000 with fifteen episodes, then a carousel of the five
ideas that explain them, written for an econ 101 reader.

## Pipeline

```
python fetch.py            # FRED DGS10 + DFF -> src/app/projects/bond-yields/data/yields.json
python fetch.py --offline  # rebuild from raw/ without the network
python thumbnail.py        # -> public/landing/bond-yields.png (needs rsvg-convert)
```

Stdlib only. The data is a snapshot by design: the page prints the
"data through" date and `fetch.py` is the one command that moves it.
`raw/` is gitignored.

## Where the content lives

- `src/app/projects/bond-yields/pillars.ts` — the five ideas (copy, colors, questions); `IdeaCarousel.tsx` renders them.
- `src/app/projects/bond-yields/episodes.ts` — the fifteen episodes; each tags the
  forces at work with a one-line note. Levels are rounded from the weekly series.
- `YieldChart.tsx` — hand-rolled SVG: hover crosshair, numbered markers in a
  two-row strip, force filter, episode card in a side panel.

## Adding an episode

Append to `EPISODES` with `start`/`end` (band) and `anchor` (marker date),
then refresh the data so the anchor is inside the series. Numbers in
`levels` should be re-read from `fetch.py`'s output, not typed from memory.
