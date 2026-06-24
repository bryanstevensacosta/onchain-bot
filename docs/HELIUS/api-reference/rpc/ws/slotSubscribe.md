> ## Documentation Index
> Fetch the complete documentation index at: https://www.helius.dev/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# slotSubscribe

> Subscribe to receive notification anytime a slot is processed by the validator.

## Endpoints

Websockets are available on mainnet and devnet with the following URLs:

* **Mainnet** `wss://mainnet.helius-rpc.com/?api-key=<api-key>`
* **Devnet** `wss://devnet.helius-rpc.com/?api-key=<api-key>`

<Note>Websockets have a 10-minute inactivity timer; implementing health checks and sending pings every minute is heavily recommended to keep the websocket connection alive.</Note>

## Authorizations

<ParamField query="api-key" type="string" required>
  Your Helius API key. You can get one for free in the [dashboard](https://dashboard.helius.dev/api-keys).
</ParamField>

## Body

<ParamField body="params" type="array">
  <Expandable title="properties" defaultOpen>
    <ParamField body="none" type="null">
      No parameters required.
    </ParamField>
  </Expandable>
</ParamField>

## Response

<ResponseField name="result" type="integer">
  Subscription id (needed to unsubscribe)
</ResponseField>

## Notification Format

The notification will be an object with the following fields:

* `parent: <u64>` - The parent slot
* `root: <u64>` - The current root slot
* `slot: <u64>` - The newly set slot value

<RequestExample>
  ```json Request theme={"system"}
  {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "slotSubscribe"
  }
  ```
</RequestExample>

<ResponseExample>
  ```json Response theme={"system"}
  {
    "jsonrpc": "2.0",
    "result": 0,
    "id": 1
  }
  ```

  ```json Notification theme={"system"}
  {
    "jsonrpc": "2.0",
    "method": "slotNotification",
    "params": {
      "result": {
        "parent": 75,
        "root": 44,
        "slot": 76
      },
      "subscription": 0
    }
  }
  ```
</ResponseExample>