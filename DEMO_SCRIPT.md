# Roofing Quote Bot — Demo Script & Recording Guide

Two deliverables here:

1. **`demo.html`** — a self-contained, auto-playing walkthrough. No server, no
   dependencies. Double-click it (or `start demo.html`) and hit **▶ Play**.
2. **This script** — voiceover narration + a shot list so you can screen-record
   `demo.html` into an actual `.mp4`, or present it live.

---

## The story (≈90 seconds)

It's one continuous scenario: a roofing owner quotes **42 Maple Ave, Austin TX**.
It shows the whole point of the product — *don't spend $10 until the lead is real.*

| Beat | On screen | Voiceover line |
|---|---|---|
| Intro | Title + problem caption | "Roofing owners need fast quotes. But a paid EagleView measurement costs about ten dollars — too expensive to run on every lead that comes in." |
| 1 · Address | User pastes address | "The owner just drops in the address and the job basics. No climbing a roof, no manual measuring." |
| 2 · Pre-quote | Yellow Google Solar card | "Tier one fires automatically — a *free* Google Solar lookup. Ballpark area and pitch, zero dollars spent." |
| 3 · Range | ±15% range + quote card | "The pricing engine returns a *range*, not a fake-precise number, because the measurements are still estimates." |
| 4 · Qualify | Bot asks questions | "Instead of spending money, it qualifies the lead first — timeline, budget, decision-maker." |
| 5 · The gate | Vague reply → bot holds | "And here's the core safeguard. A wishy-washy 'they seem interested' is *not* consent. No ten dollars spent on a maybe." |
| 6 · Confirm | Explicit yes | "Only an explicit, qualified confirmation unlocks the paid step." |
| 7 · Contract report | Green EagleView card | "*Now* tier two runs — a real EagleView report. Notice it corrected the estimate: the roof is actually steeper and smaller than Solar guessed." |
| 8 · Final quote | Contract-grade quote | "Re-priced on verified measurements — one defensible contract-grade number, saved to history." |
| Recap | Recap caption | "Free pre-quote on every lead. Ten dollars spent only on qualified, confirmed jobs. Faster quotes, protected margins, zero wasted spend." |

**Closing line (optional):** "That's Roofing Quote Bot — the estimating
assistant that knows when *not* to spend your money."

---

## How to record it as a video

`demo.html` has a built-in **recording mode** for a clean one-take capture.

### Recording mode (recommended)
1. Open **`demo.html?record`** in Chrome (add `&fast` for a ~60s cut instead
   of ~90s: `demo.html?record&fast`). Press **F11** for fullscreen.
   - In the address bar it's e.g.
     `file:///C:/Users/georg/roofing-quote-bot/demo.html?record`
2. You'll see a clean start screen — **all controls and chrome are hidden**.
3. Start your screen recorder.
4. Click **▶ Begin** (or press **Spacebar**). The demo plays start to finish
   on its own and stops on the recap — no further interaction, no UI clutter.
5. Stop the recorder when the recap caption shows.

### Manual mode (alternative)
1. Open `demo.html` (no `?record`), press **F11**.
2. Set the speed dropdown to **1×** (or 1.6× for a tighter ~60s cut).
3. Start your recorder, then click **▶ Play** — it auto-advances start to finish.
   - **Windows built-in:** press `Win + Alt + R` (Xbox Game Bar) to record the
     window; `Win + Alt + R` again to stop. File lands in
     `C:\Users\georg\Videos\Captures`.
   - **Higher quality:** OBS Studio — Window Capture on the browser, 1080p/30.
4. Record the voiceover separately (phone voice memo is fine) and lay it over
   the screen capture, or just narrate live while recording.

### Presenting live instead
Use the **Prev / Next** buttons to step through at your own pace while you
talk — the captions double as your speaker notes, so you can present without
the script in hand.

---

## Notes

- Numbers in the demo are the **real outputs** from the end-to-end test run
  (pre-quote $6,600–$8,900 midpoint $7,731; contract-grade $10,578). The
  contract step intentionally shows the estimate getting *corrected* (2,350 →
  2,180 sqft, 3:12 → 7:12) — that's the strongest argument for the paid tier.
- The product name is a **working title** ("Quote Bot"). The demo flags this in
  the top-right. To rebrand, edit the three spots near the top of `demo.html`:
  the `<title>`, `.titlebar h1`, and the sidebar `.brand` text. Open
  name candidates: **Ridge**, **Pitch**, **RoofPilot**.
