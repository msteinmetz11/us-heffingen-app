# US Heffingen app

Single-page app for the first men's team of US Heffingen (Nationale 2): schedule, results with box scores, standings, squad stats and weekly training times.

No build step. Everything is in `index.html`.

## Publish with GitHub Pages
1. Create a repository and upload all files from this folder.
2. Open **Settings > Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The app is then available at `https://<your-name>.github.io/<repository>/`.

## Update the data
All data is in the script at the top of `index.html`: `PLAYED` (finished league games), `FIXTURES` (upcoming games), `BOX` (box scores), `PLAYERS`, `TRAINING_WEEK`.

## Notes
- Data comes from luxembourg.basketball and extranet.flbb.lu (as of 11 Nov 2026). The standings are calculated from the results and can differ from the official table.
- The club logo belongs to US Heffingen.
