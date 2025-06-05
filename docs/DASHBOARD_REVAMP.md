# Astrolabe TUI — UX Redesign Proposal

_Version 0.1 · 2025‑06‑04_

---

## 1 · Objective

Improve the ergonomics and aesthetic appeal of the **Astrolabe** blessed‑TUI so that both developers and AI agents can navigate tasks quickly, discover commands intuitively, and maintain context at a glance.

---

## 2 · Current UX Assessment

| Area                     | Observation                                             | Impact                                    |
| ------------------------ | ------------------------------------------------------- | ----------------------------------------- |
| **Status Indicators**    | Single ○ glyph for all non‑completed tasks              | Ambiguous state → cognitive load          |
| **Keybinding Discovery** | Help lives behind `?`                                   | Commands feel hidden; “guess culture”     |
| **Visual Hierarchy**     | Dense mono‑weight text; projects vs. tasks hard to scan | Slower navigation & context loss          |
| **Bottom Bar**           | Mostly static legend                                    | Wasted real estate for dynamic feedback   |
| **Breadcrumb / Context** | Only highlighted rows                                   | Users forget where they are in deep trees |

---

## 3 · Design Goals

1. **Immediate clarity** – status, priority, and hierarchy readable in <1 s.
2. **Progressive discoverability** – advanced commands appear only when helpful (à la _Zellij_).
3. **Spatial memory** – stable layout that users can learn once.
4. **A11y Ready** – color‑blind safe palette + keyboard‑only flows.
5. **Zero‑lag** – preserve blessed performance; no flicker.
6. **Extensible** – future plugins (e.g., kanban view) slot in cleanly.

---

## 4 · Proposed UX Improvements

### 4.1 Status & Priority Glyphs

| State                                                             | Glyph       | Color   | Example        |
| ----------------------------------------------------------------- | ----------- | ------- | -------------- |
| _Pending_                                                         | ▢           | dim     | ▢ Research API |
| _In Progress_                                                     | ▶           | yellow  | ▶ Write tests  |
| _Blocked_                                                         | ✖           | red     | ✖ Deploy hook  |
| _Done_                                                            | ✔           | green   | ✔ Merge PR     |
| _High Priority_                                                   | ‼ (overlay) | magenta | ▶‼ Re‑index db |
| _Legend auto‑renders in bottom bar & hides when space is needed._ |             |         |                |

### 4.2 Command & Keybinding Discovery

- **Modal overlay (Space bar)**

  - Hold/press <kbd>Space</kbd> to open a _command palette_ overlay.
  - Keys radiate around the cursor (visual similar to *Zellij*).

- **Contextual footer hints**

  - Bottom bar switches to “Hint” mode after 3 s of user idle, showing two high‑probability next actions.

- **First‑use tool‑tips**

  - Light grey inline tips fade after the first two activations per command (stored in config).

### 4.3 Layout & Visual Hierarchy

- **Tree connectors** (└─, ├─) to show depth visually.
- **Panel focus shading** – inactive panes 30% dim.
- **Adaptive truncation** with ellipsis; hover or press `→` to horizontally scroll.
- **Resizable panes** with <kbd>Alt</kbd>+Arrows; store sizes in user config.

### 4.4 Dynamic Bottom Bar

| Zone       | Content (examples)                               |
| ---------- | ------------------------------------------------ |
| **Left**   | _Mode_: NORMAL / COMMAND / INSERT                |
| **Center** | _Contextual hints_: "Press <Space> for commands" |
| **Right**  | _Stats_: 12/58 Done · 3 Blocked · 4:37 PM        |

### 4.5 Theme & A11y

- **Palette switcher**: default, high‑contrast, solarized‑dark.
- All color choices pass WCAG AA for contrast.
- Optional ASCII‑only fallback (no Unicode glyphs).

### 4.6 Extensibility Hooks

- Emit custom events (`onSelectTask`, `onKeyHint`) so other modules (e.g., dependency graph view) can piggy‑back.

---

## 5 · Implementation Roadmap

| Phase | Milestone                 | Est. Effort |
| ----- | ------------------------- | ----------- |
| P0    | Glyph set & bottom legend | 0.5 d       |
| P1    | Modal keybinding overlay  | 2 d         |
| P2    | Layout & connectors       | 1.5 d       |
| P3    | Theme/A11y refactor       | 1 d         |
| P4    | Plugin event bus          | 1 d         |

---

_End of document_
