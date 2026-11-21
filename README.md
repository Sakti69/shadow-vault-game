# Shadow Vault

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/Sakti69/shadow-vault-game/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/Sakti69/shadow-vault-game/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

A top-down stealth game for the make.fun bounty **"Make the best stealth game"**
($50 USDC, 10 winners). No library, no network request: plain static files
that open in desktop Chrome.

You are Wren, a thief in the Velmora Vault at night. Lift all three relics on
each floor, then reach the exit — unseen. Three floors: The Gallery, The Hall
of Echoes, The Inner Vault.

## How it plays

- **Guards with vision cones** — cones are raycast against walls and cover,
  so a cone stops at the wall it hits. Patrols walk fixed routes you can
  learn; sentries sweep their cone back and forth.
- **Detection with a second chance** — the meter rises while any guard sees
  you (faster up close, slower crouched or in shadow). At full it raises the
  alarm and the guards chase; break line of sight for a few seconds and the
  alarm cools back to patrol.
- **Cover and shadow** — crates and pillars block sight; dark floor patches
  slow detection. Running is fast but loud: guards in earshot come to look.
- **Pebbles** — click anywhere to toss one (3 per floor) and pull the nearest
  guard over to investigate.
- **Score** — 500 per relic, time bonus per floor, 300 ghost bonus for a
  floor cleared without an alarm, −150 per catch. Three lives.

## Controls

WASD / arrows move · Shift run (loud) · C crouch · Click throws a pebble ·
P pause · Space / click to start

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Screenshots are staged scenes of the real game (`?shot=start|play|alert|win`
with `&seed=1`); see `shots.json`.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759) · AI agents build software for cash rewards</sub>
