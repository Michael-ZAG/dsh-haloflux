# dsh-haloflux — live light-ring background

> **Unofficial distribution fork.** This repository is a public release fork of
> [Ke-wood/dsh-haloflux](https://github.com/Ke-wood/dsh-haloflux), published so the plugin
> can be installed from the DSH plugin market.
>
> Original HALOFLUX visual and motion design © 2026 Ryder191 (RYDER CODE / Ms MAIKEBAIs CAT)
> — [Ryder191/haloflux](https://github.com/Ryder191/haloflux).
> DeepSeek Harness integration © Ke-wood. This fork only packages and distributes;
> it is not an official release by the original authors and comes with no warranty.
>
> License: [PolyForm Noncommercial License 1.0.0](LICENSE) — **noncommercial use only**.
> Redistribution must keep `LICENSE` and `NOTICE` (both `Required Notice` lines) intact.

A full-frame Canvas background for the DeepSeek Harness Web GUI. The pure visual
light field of HALOFLUX is kept, while its simulated data is replaced with the **live
session**: the ring rotates with turns, tokens are captured as they stream, and beams
fire on tool calls, then settle when the call ends.

## Features

| Capability | Detail |
|---|---|
| Full-frame background | Mounts on `shell.overlay`: transparent, additive glow, click-through |
| Session-driven | Tokens, tool calls, `turn/step`, tok/s and context usage all come from real session events |
| Three data-capture modes | Pure animation / mixed 30% / full capture |
| Settings page | **Settings → HALOFLUX**: mode, presets, import/export, all 79 parameters |
| HUD | `H`: KPI bar, event stream, tool dispatch, camera buttons (off by default) |
| Three-state machine | Running / quiet / no-session, each with its own target intensity and curves |
| Session switch | The disc turns a full 360° with parallax on the outer beams |
| Transition effects | Five independent toggles: outer follow, content reveal, brightness pulse, hue sweep, camera push |

## Install

Requires DeepSeek Harness (desktop app or `dsh web`).

```text
dsh plugin --profile desktop add "github:Michael-ZAG/dsh-haloflux"
```

Or install a local directory with `plugin_manager install_bundle target=<absolute path>`,
or search `haloflux` in **Plugins → Plugin Market**.

After installing, refresh the page: **Settings → HALOFLUX** appears at the bottom of the sidebar.

## Shortcuts

| Key | Action |
|---|---|
| `C` | Toggle the quick-tuning overlay |
| `H` | Toggle the HUD |
| `Esc` | Close the overlay |

## Presets

`READ` (recommended for long reading sessions):

```text
scale=0.46 centerY=0.08 opacity=0.42 guardOn=1 guardColW=780 guardBlur=9
motionQuiet=1 ringData=0.6
```

`EDGE` (lighter, lower contrast, no column guard): `scale=0.44 centerY=0.1 opacity=0.5 guardOn=0`

## Uninstall

```text
dsh plugin --profile desktop remove dsh-haloflux
```

## License

PolyForm Noncommercial License 1.0.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
Commercial use is not permitted.
