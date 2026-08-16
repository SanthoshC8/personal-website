# My Finances

A personal finance dashboard — net worth, budgets, a calendar, and money tasks — in three plain files with no build step and no backend. Looks and behaves like a native app on iPhone (bottom tab bar, safe-area padding, a floating add button) and expands to a sidebar layout on desktop.

## Deploy it on GitHub Pages

1. Create a new repository on GitHub (public repos get free Pages hosting).
2. Add these three files to the repo root: `index.html`, `styles.css`, `app.js`.
   - Easiest way: on the repo page, click **Add file → Upload files**, drag all three in, and commit.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to `Deploy from a branch`, pick the `main` branch and `/ (root)` folder, then **Save**.
5. GitHub gives you a URL like `https://yourusername.github.io/your-repo-name/` — it can take a minute or two to go live.
6. Open that link on your iPhone and, optionally, use Safari's **Share → Add to Home Screen** to make it feel like an installed app.

That's it — no npm install, no build command.

## How it works

- All data (transactions, budgets, tasks, settings) is stored in the browser's `localStorage`. Nothing is sent to a server, so it's private to whichever device and browser you open it on — it won't sync between your phone and laptop.
- It ships with realistic demo data (paychecks, rent, groceries, etc.) so the dashboard, chart, and budget bars aren't empty on first load.
- Use the gear icon to set your own starting balance, currency, and monthly income goal, or to reset back to the demo data.

## Customizing

- **Colors, fonts, spacing**: all defined as CSS variables at the top of `styles.css` (the `:root` block) — change one value and it updates everywhere.
- **Demo/starter data**: edit the `seedState()` function near the top of `app.js`.
- **Categories**: the transaction category list is in the `<select id="txnCategory">` in `index.html`.

## Limitations to know about

- No real bank connections — this is a manual ledger, not an aggregator like Mint or YNAB.
- Because data lives in `localStorage`, clearing your browser's site data (or using a different browser/device) will reset it to the demo set.
