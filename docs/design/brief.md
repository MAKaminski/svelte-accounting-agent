# Design brief — Accounting Agent (2026-11-21)

**Subject:** a review desk for an accounting agent. A bookkeeper or owner checks the agent's coding of bank and card
transactions, approves or corrects it, and answers its questions. **Job of the UI:** make "is this right?" answerable
in one glance per row, and make approving feel safe (undo) and fast (keyboard).

## Principles
1. **The agent's reasoning is the product.** Every row shows what it chose, how sure it is, and why — in that order.
   Confidence and the one-line "why" are the only expressive elements; everything else stays quiet.
2. **Ink, not black.** Surfaces are a deep blue-black "ledger ink", layered in four steps with hairline outlines.
   Depth comes from layering and outlines, not heavy shadows.
3. **One accent, used for decisions.** The indigo→violet gradient appears only on the primary action, the active
   nav item, focus, and the confidence meter. Money in is mint; warnings amber; errors rose. Nothing else is coloured.
4. **Numbers are set like numbers.** Amounts and ids in a mono face with tabular figures, right-aligned, signed.
5. **Space over boxes.** Rows breathe (52 px), sections are separated by space and a hairline, not by cards inside
   cards. A card is used only for a self-contained object (a connection, an evidence item, a stat).
6. **Motion answers actions.** Approve slides the row out and a toast counts down the undo window. No ambient motion.
   All motion off under `prefers-reduced-motion`.
7. **Keyboard is first-class.** Visible focus ring, shortcuts shown on the controls they trigger, ⌘K everywhere.

## Tokens (dark default; light theme mirrors them)
| Token | Dark | Light |
|---|---|---|
| page / panel / raised / overlay | `#0A0E17` / `#101623` / `#161D2E` / `#1C2540` | `#F6F7FB` / `#FFFFFF` / `#FFFFFF` / `#FFFFFF` |
| hairline / hairline-strong | `rgb(148 163 196 / .14)` / `.26` | `rgb(15 23 42 / .10)` / `.18` |
| text / text-2 / muted | `#E8ECF6` / `#A9B3C9` / `#8791A8` | `#0F172A` / `#3B4660` / `#5B667E` |
| accent gradient | `#6E7CFF → #A56BFF` | `#4F5BFF → #8B4DFF` |
| ok / warn / danger | `#3DD68C` / `#F5B544` / `#FF6B7A` | `#0E9F5B` / `#B26A00` / `#D4283C` |

Type: Inter (UI, 13/14 body, 20/28 headings, 600 for emphasis) and JetBrains Mono (amounts, ids), self-hosted.
Radius 8 (controls), 12 (cards), 16 (dialogs). Spacing on a 4-pt scale. Transitions 120–180 ms ease-out.

## Do / don't
- Do show the shortcut on the button (`Approve A`). Don't hide actions behind hover.
- Do keep one primary button per view. Don't use the gradient for decoration or backgrounds of content.
- Do write plain labels ("Needs your answer"). Don't use all-caps labels or system terms (process ids stay on /system).
- Do design empty, loading, error and partial states for every screen.
