# SUSSY

An Among Us style social deduction game that runs in the browser, with real players, bots that fill empty seats, and a link that can be shared in an X post. All art, characters and sound are original and generated in code (no official assets).

## The 5 files 

| File | What it is |
|---|---|
| `index.html` | The whole game client (page, graphics, sound, mini-games) |
| `server.js` | The game server (rooms, rules, bots, WebSockets) |
| `package.json` | Tells Node what to install (`ws`) and how to start |
| `card.png` | Preview image shown in the X post (square, 1120x1120) |
| `README.md` | This file |

## 1. Run it on your computer

1. Install Node.js 18 or newer from nodejs.org.
2. Open a terminal **in the folder with the 5 files**.
3. Run `npm install`, then `npm start`.
4. Open http://localhost:3000. Open it in a few tabs to see several players in one lobby.

## 2. Put it online 

Netlify and Vercel will not work: the game needs a server that stays running and accepts WebSockets. Use Railway (easiest), Render, or Fly.io.

Railway:
1. Put the 5 files in a GitHub repo (github.com/new, then "uploading an existing file").
2. On railway.app choose New Project, Deploy from GitHub repo, pick the repo. It detects `npm start` by itself.
3. Open the service, Settings, Networking, Generate Domain. You get `https://something.up.railway.app`.
4. Open Variables and add `PUBLIC_URL` = that address, starting with `https://`. It redeploys.
5. Open the address. If the title screen loads and the Play button works, you are live.

Free tiers that put the app to sleep (some Render plans) will drop players. Use a plan that stays awake.

## 3. Make it play inside an X post

The page already contains the Twitter Player Card tags (`twitter:card=player`, `twitter:player`, 560x560, `twitter:image=card.png`) and sends a frame policy that lets x.com and twitter.com embed `/play`. You only need the right `PUBLIC_URL`.

1. Post a tweet that contains your link, for example `https://something.up.railway.app/`.
2. Look at how X renders it. If it shows the inline player, people can click Play and join right inside the post.
3. If X only shows a normal link preview (image plus title), X has not enabled the inline player for your domain. Card tags do not guarantee it, and that decision is X's. The link still opens the game in one tap.
4. Optional: set `TWITTER_CARD=summary_large_image` to get a large image preview instead of the player card, and `TWITTER_SITE=yourhandle` to attach your handle.
5. X caches card data. If you change the image or tags, post a link with a new query string such as `?v=2`.

Inside an embedded player, click the game once so the keyboard works. Sound starts after Play is pressed (browsers require a click).

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | WASD or arrows, or hold the mouse button toward a direction | Drag on the left side |
| Use (tasks, fix, emergency button) | E or Space | Use button |
| Report body | R | Report button |
| Map | M or Tab | Map icon |
| Kill (imposter) | Q | Kill button |
| Vent (imposter) | V, then A/D or arrows to hop | Vent button |
| Sabotage (imposter) | G | Sabotage button |

## How a round works

- Every lobby has at least 8 players; bots fill the empty seats. Bots are marked "bot" on the voting screen. 9 or more players means 2 imposters.
- Crew finish their tasks (9 different mini-games) or vote out every imposter. Imposters kill, use vents and sabotage until they equal or outnumber the crew, or the reactor melts down, or the 8 minute timer ends.
- Lights sabotage shrinks crew vision until someone flips the switches in Electrical. Reactor sabotage needs two players holding the Reactor and Engine panels at the same time before the countdown ends.
- Report a body or press the emergency button to call a meeting: discuss in chat, then vote. A player who leaves is replaced by a bot. Dead players can still finish tasks as ghosts and see everything.
- Idle players are removed after 2 minutes in a live round.

## Settings (environment variables, all optional)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Port to listen on (hosts set this for you) |
| `PUBLIC_URL` | auto | Your public address, used in the X card tags. `https://` is added if you forget it |
| `ROOM_SIZE` | 10 | Max human players per lobby |
| `MAX_ROOMS` | 200 | Max lobbies at once (capacity = ROOM_SIZE x MAX_ROOMS) |
| `MIN_PLAYERS` | 8 | Bots fill each lobby up to this many players |
| `IDLE_MS` | 120000 | Idle time before a player is removed |
| `MAX_PER_IP` | 20 | Simultaneous connections per IP |
| `TWITTER_CARD` | player | `player`, `summary_large_image` or `summary` |
| `TWITTER_SITE` | none | Your X handle for card metadata |
| `BAD_WORDS` | none | Extra words to block in names and chat, comma separated, 4+ letters each (example: `BAD_WORDS=grape,zonk`) |

Players are placed automatically: the fullest lobby with a free seat first, new lobbies as needed, empty lobbies deleted.

## Capacity (measured, not promised)

Load test with 200 simultaneous connected players (20 full lobbies) on one Node process: about 570 KB/s outbound in total (2.8 KB/s per player), about 12% of one CPU core, about 75 MB of memory. Extrapolating, one modest core should handle on the order of 1,000 players at once, and bandwidth is the first limit to watch. Beyond that, run more than one copy of the server on separate URLs.

## Notes

- The server decides everything that matters (movement speed, kill range and cooldown, task timing, votes), so a modified browser cannot kill from across the map or finish tasks instantly.
- Names and meeting chat go through a word filter for slurs and strong swearing, including leetspeak and spaced-out letters. A blocked name is swapped for a random "Crew" name and a blocked message shows as hidden. It works word by word, so normal lines like "who reported?" are fine. It is a basic filter, not moderation.
- Names are not stored and there are no accounts.
- The page is sent compressed (about 32 KB instead of 120 KB), so it loads fast inside an embed.
- If players see "Disconnected", the host went to sleep or restarted. Check `https://your-address/health`, which should say `ok`.
