> ## Documentation Index
> Fetch the complete documentation index at: https://www.helius.dev/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# transactionSubscribe

> Subscribe to real-time transaction events with custom filters. Monitor specific accounts, exclude vote transactions, and receive instant notifications with configurable detail levels.

## Endpoints

Enhanced WebSockets are available on mainnet and devnet:

* **Mainnet** `wss://mainnet.helius-rpc.com/?api-key=<api-key>`
* **Devnet** `wss://devnet.helius-rpc.com/?api-key=<api-key>`

<Note>WebSockets have a 10-minute inactivity timer; implementing health checks and sending pings every minute is heavily recommended to keep the WebSocket connection alive.</Note>

## Authorizations

<ParamField query="api-key" type="string" required>
  Your Helius API key. You can get one for free in the [dashboard](https://dashboard.helius.dev/api-keys).
</ParamField>

## Body

<ParamField body="params" type="array" required>
  <Expandable title="TransactionSubscribeFilter" defaultOpen>
    <ParamField body="vote" type="boolean">
      Include or exclude vote-related transactions.
    </ParamField>

    <ParamField body="failed" type="boolean">
      Include or exclude transactions that failed.
    </ParamField>

    <ParamField body="signature" type="string">
      Filter updates to a specific transaction by its signature.
    </ParamField>

    <ParamField body="accountInclude" type="string[]">
      List of accounts to receive transaction updates for. A transaction must include **at least one** of these accounts. Supports up to 50,000 addresses.
    </ParamField>

    <ParamField body="accountExclude" type="string[]">
      List of accounts to exclude from transaction updates. Supports up to 50,000 addresses.
    </ParamField>

    <ParamField body="accountRequired" type="string[]">
      List of accounts that **must all** be included in a transaction for it to match. Supports up to 50,000 addresses.
    </ParamField>
  </Expandable>

  <Expandable title="TransactionSubscribeOptions">
    <ParamField body="commitment" type="string">
      Commitment level for fetching data. Can be `processed`, `confirmed`, or `finalized`.
    </ParamField>

    <ParamField body="encoding" type="string">
      Encoding format for the returned data. Can be `base58`, `base64`, or `jsonParsed`.
    </ParamField>

    <ParamField body="transactionDetails" type="string">
      Level of detail for the returned transaction data. Can be `full`, `signatures`, `accounts`, or `none`.
    </ParamField>

    <ParamField body="showRewards" type="boolean">
      Whether to include reward data in the updates.
    </ParamField>

    <ParamField body="maxSupportedTransactionVersion" type="integer">
      The highest transaction version to receive updates for. Set to `0` to get both legacy and versioned transactions.

      <Note>Required when `transactionDetails` is set to `"accounts"` or `"full"`.</Note>
    </ParamField>
  </Expandable>
</ParamField>

## Response

<ResponseField name="result" type="integer">
  Subscription id (needed to unsubscribe)
</ResponseField>

<RequestExample>
  ```json Request theme={"system"}
  {
    "jsonrpc": "2.0",
    "id": 420,
    "method": "transactionSubscribe",
    "params": [
      {
        "accountInclude": ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"]
      },
      {
        "commitment": "processed",
        "encoding": "jsonParsed",
        "transactionDetails": "full",
        "showRewards": true,
        "maxSupportedTransactionVersion": 0
      }
    ]
  }
  ```

  ```javascript Code Example theme={"system"}
  const WebSocket = require("ws");

  const ws = new WebSocket("wss://mainnet.helius-rpc.com/?api-key=<API_KEY>");

  ws.on("open", () => {
    ws.send(JSON.stringify({
      jsonrpc: "2.0",
      id: 420,
      method: "transactionSubscribe",
      params: [
        { accountInclude: ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"] },
        {
          commitment: "processed",
          encoding: "jsonParsed",
          transactionDetails: "full",
          maxSupportedTransactionVersion: 0,
        },
      ],
    }));

    // Keep connection alive
    setInterval(() => ws.ping(), 30_000);
  });

  ws.on("message", (data) => {
    console.log(JSON.parse(data.toString()));
  });
  ```
</RequestExample>

<ResponseExample>
  ```json Response theme={"system"}
  {
    "jsonrpc": "2.0",
    "result": 4743323479349712,
    "id": 420
  }
  ```

  ```json Notification theme={"system"}
  {
    "jsonrpc": "2.0",
    "method": "transactionNotification",
    "params": {
      "subscription": 4743323479349712,
      "result": {
        "transaction": {
          "transaction": [
            "Ae6zfSExLsJ/E1+q0jI+3ueAtSoW+6HnuDohmuFwagUo2BU4OpkSdUKYNI1dJfMOonWvjaumf4Vv1ghn9f3Avg0BAAEDGycH0OcYRpfnPNuu0DBQxTYPWpmwHdXPjb8y2P200JgK3hGiC2JyC9qjTd2lrug7O4cvSRUVWgwohbbefNgKQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0HcpwKokfYDDAJTaF/TWRFWm0Gz5/me17PRnnywHurMBAgIAAQwCAAAAoIYBAAAAAAA=",
            "base64"
          ],
          "meta": {
            "err": null,
            "status": {
              "Ok": null
            },
            "fee": 5000,
            "preBalances": [
              28279852264,
              158122684,
              1
            ],
            "postBalances": [
              28279747264,
              158222684,
              1
            ],
            "innerInstructions": [],
            "logMessages": [
              "Program 11111111111111111111111111111111 invoke [1]",
              "Program 11111111111111111111111111111111 success"
            ],
            "preTokenBalances": [],
            "postTokenBalances": [],
            "rewards": null,
            "loadedAddresses": {
              "writable": [],
              "readonly": []
            },
            "computeUnitsConsumed": 0
          }
        },
        "signature": "5moMXe6VW7L7aQZskcAkKGQ1y19qqUT1teQKBNAAmipzdxdqVLAdG47WrsByFYNJSAGa9TByv15oygnqYvP6Hn2p",
        "slot": 224341380,
        "transactionIndex": 42
      }
    }
  }
  ```
</ResponseExample>

## Managing Subscriptions

### Subscription IDs

When `transactionSubscribe` succeeds, the server returns a subscription ID in the `result` field. This is the same number that appears in `params.subscription` on every notification from that subscription:

<CodeGroup>
  ```json Subscribe Response theme={"system"}
  {
    "jsonrpc": "2.0",
    "result": 4743323479349712,
    "id": 420
  }
  ```

  ```json Notification theme={"system"}
  {
    "jsonrpc": "2.0",
    "method": "transactionNotification",
    "params": {
      "subscription": 4743323479349712,
      "result": {}
    }
  }
  ```
</CodeGroup>

Store the subscription ID from the response. You need it to unsubscribe.

### Unsubscribing

To stop receiving notifications, call `transactionUnsubscribe` with the subscription ID. Each `transactionSubscribe` call on the same connection creates a separate subscription with its own ID, so make sure to unsubscribe before resubscribing to avoid receiving duplicate notifications.

<CodeGroup>
  ```json Request theme={"system"}
  {
    "jsonrpc": "2.0",
    "id": 421,
    "method": "transactionUnsubscribe",
    "params": [4743323479349712]
  }
  ```

  ```json Response theme={"system"}
  {
    "jsonrpc": "2.0",
    "result": true,
    "id": 421
  }
  ```
</CodeGroup>

A few in-flight messages may still arrive briefly after calling `transactionUnsubscribe`. This is expected behavior.