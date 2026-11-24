# FX指標カレンダー

- 羊飼いのランク・予定は GitHub Actions (hitsujikai.yml) が毎日自動で取り込む。手動で頼まれたら `node scripts/hitsujikai.mjs` → commit → push (Actions もcommitするので先に `git pull`)。
- 結果は SBI FXトレードのAPIを優先、みんかぶは予備と「前回発表時の値動き」。照合ロジックは `scripts/match.mjs` (ページとNodeで共通)。
- 指標・要人の解説は `data/explain.json`。ページで「解説はまだありません」と出る項目があれば追記する。
- noindex / robots.txt / 出典表示は外さないこと(ランクは羊飼いのFXブログ独自の評価)。
