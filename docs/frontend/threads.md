# Short-posts screen (`/threads`)

**What it is for:** preparing short posts (the kind published as
threads), with its own words, waiting line, and writer settings —
separate from the newsroom.

**What you see:** the same building blocks as the newsroom (watchwords,
banned words, waiting line, writer settings, three on/off switches) but
for short posts. One corner of the screen carries a notice: the
automatic sending of threads is not built yet, so the waiting line only
collects and shows what WOULD be sent.

**Trip you can take here:** open the screen → add watchwords → check
the waiting line fills up → knowing nothing is sent yet, only gathered.

| What the screen shows or does    | Where it gets it from                                                           |
| -------------------------------- | ------------------------------------------------------------------------------- |
| Watchwords                       | `GET /feed-threads-publisher/keywords`                                          |
| Banned words                     | `GET /feed-threads-publisher/blacklist`                                         |
| Must-appear-together word groups | `GET /feed-threads-publisher/phrases`                                           |
| Waiting line                     | `GET /feed-threads-publisher/queue`, `GET /feed-threads-publisher/queue/counts` |
| Writer settings + switches       | `GET /feed-threads-publisher/llm/config`                                        |
| Matching on/off                  | `GET /threads/matching/config`                                                  |
