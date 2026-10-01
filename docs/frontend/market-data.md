# Market data (`/market-data`)

**What it is for:** looking up raw market facts about any coin or wallet
address, without any scores or opinions — just the facts.

**What you see:** the list of supported networks; a box where you paste
an address to find which network it belongs to; the health of the price
sources (which ones answer fast, which are down); a lookup box that
shows what an address IS (coin, wallet, program, exchange, unknown) with
its fields; and a box where you can paste many addresses at once for a
batch lookup.

**Trip you can take here:** someone sends you an address → paste it in
the lookup box → see it is a coin with its price and holders → done, no
score attached.

| What the screen shows or does       | Where it gets it from                                           |
| ----------------------------------- | --------------------------------------------------------------- |
| Supported networks                  | `GET /market-data-api/api/v1/chains`                            |
| Which network an address belongs to | `GET /market-data-api/api/v1/chains/detect?address=`            |
| Health of price sources             | `GET /market-data-api/api/v1/providers`                         |
| What an address is + its facts      | `GET /market-data-api/api/v1/addresses/:chain/:address`         |
| Short market summary (older shape)  | `GET /market-data-api/api/market-data/snapshot?chain=&address=` |
| Many addresses at once              | `POST /market-data-api/api/v1/addresses/batch`                  |
