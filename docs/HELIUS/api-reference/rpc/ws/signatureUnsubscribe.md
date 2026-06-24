> ## Documentation Index
> Fetch the complete documentation index at: https://www.helius.dev/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# signatureUnsubscribe

> Unsubscribe from signature confirmation notification.

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

<ParamField body="params" type="array" required>
  <Expandable title="properties" defaultOpen>
    <ParamField body="subscriptionId" type="integer" required>
      Subscription id to cancel.
    </ParamField>
  </Expandable>
</ParamField>

## Response

<ResponseField name="result" type="boolean">
  Unsubscribe success message.
</ResponseField>

<RequestExample>
  ```json Request theme={"system"}
  {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "signatureUnsubscribe",
    "params": [
      0
    ]
  }
  ```
</RequestExample>

<ResponseExample>
  ```json Response theme={"system"}
  {
    "jsonrpc": "2.0",
    "result": true,
    "id": 1
  }
  ```
</ResponseExample>