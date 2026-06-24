> ## Documentation Index
> Fetch the complete documentation index at: https://www.helius.dev/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# sendTransaction

> Submits a signed transaction to the cluster for processing.

This method does not alter the transaction in any way; it relays the transaction created by clients to the node as-is.

If the node's rpc service receives the transaction, this method immediately succeeds, without waiting for any confirmations. A successful response from this method does not guarantee the transaction is processed or confirmed by the cluster.

While the rpc service will reasonably retry to submit it, the transaction could be rejected if transaction's recent\_blockhash expires before it lands.

Use [getSignatureStatuses](/api-reference/rpc/http/getsignaturestatuses) to ensure a transaction is processed and confirmed.

Before submitting, the following preflight checks are performed:

1. The transaction signatures are verified
2. The transaction is simulated against the bank slot specified by the preflight commitment. On failure an error will be returned. Preflight checks may be disabled if desired. It is recommended to specify the same commitment and preflight commitment to avoid confusing behavior.

The returned signature is the first signature in the transaction, which is used to identify the transaction (transaction id). This identifier can be easily extracted from the transaction data before submission.

## Request Parameters

<ParamField body="transaction" type="string" required>
  The fully-signed Solana transaction encoded as a base-58 string for blockchain submission.
</ParamField>

<ParamField body="encoding" type="string">
  Data encoding format used for the Solana transaction payload.

  * `base58`
  * `base64`
</ParamField>

<ParamField body="skipPreflight" type="boolean">
  When true, bypasses Solana's preflight transaction validation for faster submission.
</ParamField>

<ParamField body="preflightCommitment" type="string">
  Solana network commitment level for transaction validation checks.

  * `confirmed`
  * `finalized`
  * `processed`
</ParamField>

<ParamField body="maxRetries" type="number">
  Maximum number of automatic retry attempts for failed Solana transaction submissions.
</ParamField>

<ParamField body="minContextSlot" type="number">
  Minimum Solana blockchain slot required for transaction processing.
</ParamField>


## OpenAPI

````yaml openapi/rpc-http/sendTransaction.yaml POST /
openapi: 3.1.0
info:
  title: Solana RPC API
  version: 1.0.0
  description: >-
    Fast and reliable Solana transaction submission API for sending signed
    transactions to the Solana blockchain with configurable preflight checks and
    retry options.
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
      summary: sendTransaction
      description: >
        Submit signed transactions to the Solana blockchain network with
        configurable options. 

        This essential API enables applications to broadcast transactions for
        validation and 

        inclusion in the ledger, supporting all Solana transaction types
        including token transfers, 

        NFT minting, smart contract calls, and program deployments. Features
        include preflight 

        checks, customizable retry logic, and immediate transaction signature
        responses for 

        tracking confirmation status.
      operationId: sendTransaction
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
                    - sendTransaction
                  description: The name of the RPC method to invoke.
                  example: sendTransaction
                  default: sendTransaction
                params:
                  type: array
                  description: Parameters for sending a transaction.
                  default:
                    - >-
                      4hXTCkRzt9WyecNzV1XPgCDfGAZzQKNxLXgynz5QDuWWPSAZBZSHptvWRL3BjCvzUXRdKvHL2b7yGrRQcWyaqsaBCncVG7BFggS8w9snUts67BSh3EqKpXLUm5UMHfD7ZBe9GhARjbNQMLJ1QD3Spr6oMTBU6EhdB4RD8CP2xUxr2u3d6fos36PD98XS6oX8TQjLpsMwncs5DAMiD4nNnR8NBfyghGCWvCVifVwvA8B8TJxE1aiyiv2L429BCWfyzAme5sZW8rDb14NeCQHhZbtNqfXhcp2tAnaAT
                  items:
                    oneOf:
                      - type: string
                        description: >-
                          The fully-signed Solana transaction encoded as a
                          base-58 string for blockchain submission.
                        example: >-
                          4hXTCkRzt9WyecNzV1XPgCDfGAZzQKNxLXgynz5QDuWWPSAZBZSHptvWRL3BjCvzUXRdKvHL2b7yGrRQcWyaqsaBCncVG7BFggS8w9snUts67BSh3EqKpXLUm5UMHfD7ZBe9GhARjbNQMLJ1QD3Spr6oMTBU6EhdB4RD8CP2xUxr2u3d6fos36PD98XS6oX8TQjLpsMwncs5DAMiD4nNnR8NBfyghGCWvCVifVwvA8B8TJxE1aiyiv2L429BCWfyzAme5sZW8rDb14NeCQHhZbtNqfXhcp2tAnaAT
                      - type: object
                        description: >-
                          Advanced configuration options for Solana transaction
                          submission and processing.
                        properties:
                          encoding:
                            type: string
                            description: >-
                              Data encoding format used for the Solana
                              transaction payload.
                            enum:
                              - base58
                              - base64
                            example: base64
                          skipPreflight:
                            type: boolean
                            description: >-
                              When true, bypasses Solana's preflight transaction
                              validation for faster submission.
                            example: false
                          preflightCommitment:
                            type: string
                            description: >-
                              Solana network commitment level for transaction
                              validation checks.
                            enum:
                              - confirmed
                              - finalized
                              - processed
                            example: finalized
                          maxRetries:
                            type: integer
                            description: >-
                              Maximum number of automatic retry attempts for
                              failed Solana transaction submissions.
                            example: 5
                          minContextSlot:
                            type: integer
                            description: >-
                              Minimum Solana blockchain slot required for
                              transaction processing.
                            example: 1000
            example:
              jsonrpc: '2.0'
              id: '1'
              method: sendTransaction
              params:
                - >-
                  4hXTCkRzt9WyecNzV1XPgCDfGAZzQKNxLXgynz5QDuWWPSAZBZSHptvWRL3BjCvzUXRdKvHL2b7yGrRQcWyaqsaBCncVG7BFggS8w9snUts67BSh3EqKpXLUm5UMHfD7ZBe9GhARjbNQMLJ1QD3Spr6oMTBU6EhdB4RD8CP2xUxr2u3d6fos36PD98XS6oX8TQjLpsMwncs5DAMiD4nNnR8NBfyghGCWvCVifVwvA8B8TJxE1aiyiv2L429BCWfyzAme5sZW8rDb14NeCQHhZbtNqfXhcp2tAnaAT
      responses:
        '200':
          description: Successfully sent the transaction.
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
                    type: string
                    description: >-
                      The unique Solana transaction signature for tracking
                      confirmation status and transaction history.
                    example: >-
                      2id3YC2jK9G5Wo2phDx4gJVAew8DcY5NAojnVuao8rkxwPYPe8cSwE5GzhEgJA2y8fVjDEo6iR6ykBvDxrTQrtpb
              example:
                jsonrpc: '2.0'
                id: '1'
                result: >-
                  2id3YC2jK9G5Wo2phDx4gJVAew8DcY5NAojnVuao8rkxwPYPe8cSwE5GzhEgJA2y8fVjDEo6iR6ykBvDxrTQrtpb
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