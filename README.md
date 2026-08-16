# ShopDemo — Web Security CTF

Welcome to **ShopDemo**, a staging build of an internal commerce platform.
Your club's organizers have stood up this environment for you to practice
real-world web penetration-testing techniques in a safe, isolated sandbox.

Nothing in this environment touches the real internet, the host machine, or
any real user data. Everything resets when the container restarts.

## Story

ShopDemo Inc. is preparing a staging environment for an upcoming product
launch. QA gave the team early access, but rumor has it the staging build
still has a few rough edges left over from active development. Your job:
find out how rough.

## Target

```
http://TARGET:3000
```

Replace `TARGET` with the hostname or IP your organizer gives you (this may
just be `localhost` if you're running it yourself).

When run through the Docker gateway, each browser receives its own isolated
ShopDemo container. The gateway assigns an `HttpOnly` cookie and proxies that
browser to an independent container with separate passwords, roles, notes, and
challenge state. Containers are removed after 12 hours without activity
(configurable with `IDLE_TTL_HOURS`). The assignment ledger is stored in a
Docker volume, so restarting the gateway does not merge environments.

## Shared tunnel deployment

Start the stack with the command below. It builds the participant image before
starting the gateway. Always forward the tunnel to the gateway on port `3000`,
never directly to a participant container:

```bash
docker compose up -d --build
```

For example:

```bash
cloudflared tunnel --url http://localhost:3000
```

The gateway mounts `/var/run/docker.sock` so it can create participant
containers. This grants it control over the Docker host; use a dedicated CTF
machine without unrelated workloads. The default capacity is 50 environments.
Adjust `MAX_ENVIRONMENTS`, `IDLE_TTL_HOURS`, and player resource limits in
`docker-compose.yml` when needed.

Without Docker, `npm start` runs the app directly with browser-cookie state
isolation as a fallback, but it does not create a container per participant.

## Your starting credentials

```
Username: alice
Password: alice123
Role:     user
```

You start with normal user privileges. Everything else — including any
elevated access — has to be *earned* through the challenge.

## Rules

- Only attack the ShopDemo target provided for this event. Do not scan or
  attack infrastructure that isn't explicitly part of the challenge.
- Automated tools (dirsearch, ffuf, Burp Suite, git, curl, browser DevTools,
  etc.) are all fair game and encouraged.
- Denial-of-service attacks (e.g. flooding the server, resource exhaustion)
  are not in scope — this is a discovery and exploitation exercise, not a
  stress test.
- Don't share flags with other participants/teams unless your organizer's
  scoring format explicitly allows collaboration.
- If something seems broken rather than intentionally hidden, flag it to
  your organizer rather than assuming it's part of the challenge.

## Flags

There are **7 numbered flags plus 1 final flag** (8 total), each tied to a
different weakness. Every flag follows this format:

```
FLAG{...}
```

Flags are unique per challenge — there is no pattern between them, so don't
waste time guessing.

## Scoring (suggested)

Adjust this to fit your event, but a reasonable default:

| Flag | Points |
|------|--------|
| Flag 1 | 50 |
| Flag 2 | 100 |
| Flag 3 | 100 |
| Flag 4 | 150 |
| Flag 5 | 150 |
| Flag 6 | 150 |
| Flag 7 | 200 |
| Final Flag | 300 |

## Recommended tools

- `dirsearch` or `ffuf` — content/directory discovery
- `curl` — quick manual requests
- Burp Suite (or your browser's DevTools Network tab) — inspecting and
  modifying requests
- `git` (plus optionally `git-dumper`) — investigating exposed repositories
- Your browser's DevTools — inspecting JavaScript, cookies, and responses

## A few hints to get you oriented (not spoilers)

- Start with reconnaissance. Not everything you need is linked from the UI.
- Read every response carefully, including ones that don't look important.
- Some things that look like secrets are decoys. Some things that look
  boring are not.
- The story continues even after you get your first admin session — don't
  stop there.

Good luck, and have fun.
