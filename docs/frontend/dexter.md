# Scanner (`/dexter`)

**What it is for:** the fastest screen in the app. Paste anything about
a coin — an address, or a short command with an address — and get an
instant full report or a price chart.

**What you see:** a big search box at the top (it remembers your last
ten searches, reopened with one click); a full report card for a
`/x` scan (what the address is, price, total value, supplies, holders,
owner-risk warning); a chart card for a `/c` scan (links to the price
charts plus price context); and at the very top, which chat robot is
connected for scanning, with buttons to connect or disconnect it.

**How the search box understands you:** paste a bare address and it
figures out the network by its shape (long addresses starting with
`0x` are treated as Ethereum-style; shorter letter-soup addresses are
treated as Solana). If you paste an Ethereum-style address without
saying which exact network, it tells you it assumed Ethereum and names
the other possible networks. Typing `/x` before the address gives the
full report; `/c` gives the chart.

**Trip you can take here:** copy an address from a chat → paste it in
the box → read the full report card → press a chart link to see the
price graph.

| What the screen shows or does                          | Where it gets it from                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Full report / chart (same facts as Market data screen) | `GET /market-data-api/api/v1/addresses/:chain/:address`, `GET /market-data-api/api/market-data/snapshot?chain=&address=` |
| Which network a pasted address belongs to              | `GET /market-data-api/api/v1/chains/detect?address=`                                                                     |
| Connected chat robot                                   | `GET /dexter-api/api/dexter-bots/inventory`                                                                              |
| Connect / disconnect the robot                         | `POST /dexter-api/api/dexter-bots/bind`, `POST /dexter-api/api/dexter-bots/unbind`                                       |
