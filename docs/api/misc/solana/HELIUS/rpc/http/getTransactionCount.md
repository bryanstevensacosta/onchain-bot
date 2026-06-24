> ## Documentation Index
> Fetch the complete documentation index at: https://www.helius.dev/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# getTransactionCount

> Returns the current Transaction count from the ledger.

## Request Parameters

<ParamField body="commitment" type="string">
  The finality level at which to measure the transaction count (processed = recent, finalized = confirmed).

  * `confirmed`
  * `finalized`
  * `processed`
</ParamField>

<ParamField body="minContextSlot" type="number">
  The minimum slot that the request can be evaluated at.
</ParamField>


## OpenAPI

````yaml openapi/rpc-http/getTransactionCount.yaml POST /
openapi: 3.1.0
info:
  title: Solana RPC API
  version: 1.0.0
  description: >-
    Transaction volume metrics API for tracking Solana blockchain network
    activity and total processed operations since genesis.
  license:
    name: Apache 2.0
    url: https://www.apache.org/licenses/LICENSE-2.0.html
servers:
  - url: https://mainnet.helius-rpc.com
    description: Mainnet RPC endpoint
  - url: https://devnet.helius-rpc.com
    description: Devnet RPC endpoint
security: []
paths:
  /:
    post:
      tags:
        - RPC
      summary: getTransactionCount
      description: >
        Retrieve the total transaction count processed by the Solana blockchain
        since genesis.

        This network activity metric provides insights into blockchain
        throughput and historical

        volume, tracking the cumulative number of transactions successfully
        processed across

        the network's entire history. Essential for blockchain analytics,
        network monitoring

        dashboards, throughput analysis, and applications tracking Solana's
        growth over time.

        Results can be queried at different commitment levels for varying
        degrees of finality.
      operationId: getTransactionCount
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                jsonrpc:
                  type: string
                  enum:
                    - '2.0'
                  description: The JSON-RPC protocol version.
                  example: '2.0'
                  default: '2.0'
                id:
                  type: string
                  description: A unique identifier for the request.
                  example: '1'
                  default: '1'
                method:
                  type: string
                  enum:
                    - getTransactionCount
                  description: The name of the RPC method to invoke.
                  example: getTransactionCount
                  default: getTransactionCount
                params:
                  type: array
                  description: Optional configuration object.
                  items:
                    type: object
                    description: Configuration options for the request.
                    properties:
                      commitment:
                        type: string
                        description: >-
                          The finality level at which to measure the transaction
                          count (processed = recent, finalized = confirmed).
                        enum:
                          - confirmed
                          - finalized
                          - processed
                        example: finalized
                      minContextSlot:
                        type: integer
                        description: The minimum slot that the request can be evaluated at.
                        example: 1000
            examples:
              sampleRequest:
                $ref: '#/components/examples/requestExample'
      responses:
        '200':
          description: Successfully retrieved the transaction count.
          content:
            application/json:
              schema:
                type: object
                properties:
                  jsonrpc:
                    type: string
                    description: The JSON-RPC protocol version.
                    enum:
                      - '2.0'
                    example: '2.0'
                  id:
                    type: string
                    description: Identifier matching the request.
                    example: '1'
                  result:
                    type: integer
                    description: >-
                      Total number of transactions processed by the Solana
                      blockchain since network inception.
                    example: 268
              examples:
                sampleResponse:
                  $ref: '#/components/examples/responseExample'
        '400':
          description: Bad Request - Invalid request parameters or malformed request.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                jsonrpc: '2.0'
                error:
                  code: -32602
                  message: Invalid params
                id: '1'
        '401':
          description: Unauthorized - Invalid or missing API key.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                jsonrpc: '2.0'
                error:
                  code: -32001
                  message: Unauthorized
                id: '1'
        '429':
          description: Too Many Requests - Rate limit exceeded.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                jsonrpc: '2.0'
                error:
                  code: -32005
                  message: Too many requests
                id: '1'
        '500':
          description: Internal Server Error - An error occurred on the server.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                jsonrpc: '2.0'
                error:
                  code: -32603
                  message: Internal error
                id: '1'
        '503':
          description: Service Unavailable - The service is temporarily unavailable.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                jsonrpc: '2.0'
                error:
                  code: -32002
                  message: Service unavailable
                id: '1'
        '504':
          description: Gateway Timeout - The request timed out.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                jsonrpc: '2.0'
                error:
                  code: -32003
                  message: Gateway timeout
                id: '1'
      security:
        - ApiKeyQuery: []
components:
  examples:
    requestExample:
      value:
        jsonrpc: '2.0'
        id: '1'
        method: getTransactionCount
        params:
          - commitment: finalized
    responseExample:
      value:
        jsonrpc: '2.0'
        id: '1'
        result: 268
  schemas:
    ErrorResponse:
      type: object
      properties:
        jsonrpc:
          type: string
          description: The JSON-RPC protocol version.
          enum:
            - '2.0'
          example: '2.0'
        error:
          type: object
          properties:
            code:
              type: integer
              description: The error code.
              example: -32602
            message:
              type: string
              description: The error message.
            data:
              type: object
              description: Additional data about the error.
        id:
          type: string
          description: Identifier matching the request.
          example: '1'
  securitySchemes:
    ApiKeyQuery:
      type: apiKey
      in: query
      name: api-key
      description: >-
        Your Helius API key. You can get one for free in the
        [dashboard](https://dashboard.helius.dev/api-keys).
````