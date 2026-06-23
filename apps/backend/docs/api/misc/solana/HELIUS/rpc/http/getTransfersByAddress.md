> ## Documentation Index
> Fetch the complete documentation index at: https://www.helius.dev/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# getTransfersByAddress

> Query parsed, human-readable token and native SOL transfer objects by address with filters by mint, time, amount, counterparty, and pagination.

## Overview

`getTransfersByAddress` returns parsed, human-readable transfer objects for token and native SOL movement involving a wallet address. Use filters to narrow results by mint, block time, amount, slot, direction, or counterparty. The response is designed for accurate wallet activity views, payment tracking, and balance reconciliation without reimplementing Solana transfer parsing.

<Note>
  Mint and burn transfers are one-sided. Mints have `fromUserAccount: null` and can only be returned as inbound transfers for the recipient. Burns have `toUserAccount: null` and can only be returned as outbound transfers for the burning owner.
</Note>

## Request Parameters

<ParamField body="address" type="string" required>
  Base58-encoded owner wallet address to query transfers for. Pass the wallet owner address, not an associated token account (ATA).
</ParamField>

<ParamField body="with" type="string">
  Filter by counterparty address. Returns only transfers to or from this address.
</ParamField>

<ParamField body="direction" type="string" default="any">
  Filter by transfer direction relative to the queried address.

  * `in`
  * `out`
  * `any`
</ParamField>

<ParamField body="mint" type="string">
  Token mint address. Use So11111111111111111111111111111111111111111 for native SOL and So11111111111111111111111111111111111111112 for WSOL.
</ParamField>

<ParamField body="solMode" type="string" default="merged">
  SOL/WSOL display mode. merged treats WSOL as native SOL and excludes wrap/unwrap rows so SOL-denominated history is easier to reconcile; separate preserves WSOL as a distinct SPL token mint and includes wrap/unwrap rows.

  * `merged`
  * `separate`
</ParamField>

<ParamField body="filters" type="object">
  Additional filters for amount, block time, and slot.
</ParamField>

<ParamField body="filters.amount" type="object">
  Range comparison filter. All fields are optional and can be combined.
</ParamField>

<ParamField body="filters.amount.gt" type="number">
  Greater than.
</ParamField>

<ParamField body="filters.amount.gte" type="number">
  Greater than or equal.
</ParamField>

<ParamField body="filters.amount.lt" type="number">
  Less than.
</ParamField>

<ParamField body="filters.amount.lte" type="number">
  Less than or equal.
</ParamField>

<ParamField body="filters.blockTime" type="object">
  Range comparison filter. All fields are optional and can be combined.
</ParamField>

<ParamField body="filters.blockTime.gt" type="number">
  Greater than.
</ParamField>

<ParamField body="filters.blockTime.gte" type="number">
  Greater than or equal.
</ParamField>

<ParamField body="filters.blockTime.lt" type="number">
  Less than.
</ParamField>

<ParamField body="filters.blockTime.lte" type="number">
  Less than or equal.
</ParamField>

<ParamField body="filters.slot" type="object">
  Range comparison filter. All fields are optional and can be combined.
</ParamField>

<ParamField body="filters.slot.gt" type="number">
  Greater than.
</ParamField>

<ParamField body="filters.slot.gte" type="number">
  Greater than or equal.
</ParamField>

<ParamField body="filters.slot.lt" type="number">
  Less than.
</ParamField>

<ParamField body="filters.slot.lte" type="number">
  Less than or equal.
</ParamField>

<ParamField body="limit" type="number" default="100">
  Maximum number of transfers to return. Range 1 to 100.
</ParamField>

<ParamField body="paginationToken" type="string">
  Cursor from the previous response for pagination.
</ParamField>

<ParamField body="example" type="any" />

<ParamField body="commitment" type="string" default="finalized">
  Data commitment level.

  * `finalized`
  * `confirmed`
</ParamField>

<ParamField body="minContextSlot" type="number">
  Minimum context slot to use for request (optional).
</ParamField>

<ParamField body="sortOrder" type="string" default="desc">
  Result ordering.

  * `asc`
  * `desc`
</ParamField>


## OpenAPI

````yaml openapi/rpc-http/getTransfersByAddress.yaml POST /
openapi: 3.1.0
info:
  title: Solana RPC API
  version: 1.0.0
  description: >-
    Transfer-specific Solana history API for querying parsed, human-readable
    token and native SOL transfer objects by address with filters by mint, time,
    amount, and counterparty. Designed for accurate wallet activity views,
    payment tracking, and balance reconciliation.
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
      summary: getTransfersByAddress
      description: >
        Returns parsed, human-readable token and native SOL transfer objects for

        a wallet address. This Helius RPC method returns concise
        transfer-specific

        records instead of full transaction payloads and is designed for
        accurate

        wallet activity views, payment tracking, and balance reconciliation.


        You can filter transfer history by mint, block time, amount, slot,

        direction, and counterparty.
      operationId: getTransfersByAddress
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - jsonrpc
                - id
                - method
                - params
              properties:
                jsonrpc:
                  type: string
                  enum:
                    - '2.0'
                  example: '2.0'
                  description: The JSON-RPC protocol version.
                  default: '2.0'
                id:
                  type: string
                  example: '1'
                  description: A unique identifier for the request.
                  default: '1'
                method:
                  type: string
                  enum:
                    - getTransfersByAddress
                  example: getTransfersByAddress
                  description: The name of the RPC method to invoke.
                  default: getTransfersByAddress
                params:
                  type: array
                  description: >-
                    Array containing the required wallet address and optional
                    configuration object.
                  minItems: 1
                  maxItems: 2
                  prefixItems:
                    - type: string
                      description: >-
                        Base58-encoded owner wallet address to query transfers
                        for. Pass the wallet owner address, not an associated
                        token account (ATA).
                      example: 86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY
                    - type: object
                      description: Optional transfer query configuration.
                      properties:
                        with:
                          type: string
                          description: >-
                            Filter by counterparty address. Returns only
                            transfers to or from this address.
                          example: 7hPhaUpydpvm8wtiS3k4LPZKUmivQRs7YQmpE1hFshHx
                        direction:
                          type: string
                          description: >-
                            Filter by transfer direction relative to the queried
                            address.
                          enum:
                            - in
                            - out
                            - any
                          default: any
                          example: in
                        mint:
                          type: string
                          description: >-
                            Token mint address. Use
                            So11111111111111111111111111111111111111111 for
                            native SOL and
                            So11111111111111111111111111111111111111112 for
                            WSOL.
                          example: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
                        solMode:
                          type: string
                          description: >-
                            SOL/WSOL display mode. merged treats WSOL as native
                            SOL and excludes wrap/unwrap rows so SOL-denominated
                            history is easier to reconcile; separate preserves
                            WSOL as a distinct SPL token mint and includes
                            wrap/unwrap rows.
                          enum:
                            - merged
                            - separate
                          default: merged
                          example: merged
                        filters:
                          type: object
                          description: Additional filters for amount, block time, and slot.
                          properties:
                            amount:
                              $ref: '#/components/schemas/TransferComparisonFilter'
                              description: Filter by raw transfer amount, not UI amount.
                            blockTime:
                              $ref: '#/components/schemas/TransferComparisonFilter'
                              description: Filter by block timestamp in Unix seconds.
                            slot:
                              $ref: '#/components/schemas/TransferComparisonFilter'
                              description: Filter by slot number.
                          additionalProperties: false
                        limit:
                          type: integer
                          description: >-
                            Maximum number of transfers to return. Range 1 to
                            100.
                          minimum: 1
                          maximum: 100
                          default: 100
                          example: 50
                        paginationToken:
                          type: string
                          description: Cursor from the previous response for pagination.
                        example: 315069220:308:2:1:splTransfer
                        commitment:
                          type: string
                          description: Data commitment level.
                          enum:
                            - finalized
                            - confirmed
                          default: finalized
                          example: finalized
                        minContextSlot:
                          type: integer
                          description: Minimum context slot to use for request (optional).
                          example: 1000
                        sortOrder:
                          type: string
                          description: Result ordering.
                          enum:
                            - asc
                            - desc
                          default: desc
                          example: desc
                      additionalProperties: false
                  items: false
                  example:
                    - 86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY
                    - mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
                      limit: 50
                      sortOrder: desc
            example:
              jsonrpc: '2.0'
              id: '1'
              method: getTransfersByAddress
              params:
                - 86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY
                - mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
                  limit: 50
      responses:
        '200':
          description: Successfully retrieved transfers for the specified address.
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
                    type: object
                    description: Transfer data and pagination information.
                    properties:
                      data:
                        type: array
                        description: List of transfer records.
                        items:
                          $ref: '#/components/schemas/TokenTransfer'
                      paginationToken:
                        oneOf:
                          - type: string
                            description: Cursor for retrieving the next page of results.
                          - type: 'null'
                        description: >-
                          Cursor for the next page, or null if no more results
                          are available.
                        example: 315073428:35:1:0:splTransfer
              examples:
                transferResponse:
                  summary: Transfer response
                  value:
                    jsonrpc: '2.0'
                    id: '1'
                    result:
                      data:
                        - signature: >-
                            5GEX7Q3X5Q8yJGbKYoR7mtzQmG8tpoEwzjPgqVmn3y5xg3yKwqXcDdN5YVcc9V6vA4TuH5iM6FHRVhTxvz4AX2zG
                          slot: 315073428
                          blockTime: 1736159420
                          type: transfer
                          fromUserAccount: 7hPhaUpydpvm8wtiS3k4LPZKUmivQRs7YQmpE1hFshHx
                          toUserAccount: 86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY
                          fromTokenAccount: HcvK3EJ74iM9g11cUgsaPvLSrhCvCwcrWxBNd87LsC1x
                          toTokenAccount: CBcYniR9G9CN3zGMnwNE4SWbqkYWvCFVreEob9xHnQCY
                          mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
                          amount: '2500000'
                          decimals: 6
                          uiAmount: '2.5'
                          confirmationStatus: finalized
                          transactionIdx: 35
                          instructionIdx: 1
                          innerInstructionIdx: 0
                      paginationToken: 315073428:35:1:0:splTransfer
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
    TokenTransfer:
      type: object
      properties:
        signature:
          type: string
          description: Base58-encoded transaction signature.
          example: >-
            5GEX7Q3X5Q8yJGbKYoR7mtzQmG8tpoEwzjPgqVmn3y5xg3yKwqXcDdN5YVcc9V6vA4TuH5iM6FHRVhTxvz4AX2zG
        slot:
          type: integer
          description: Slot number containing the transaction.
          example: 315073428
        blockTime:
          type: integer
          description: Unix timestamp in seconds for the block.
          example: 1736159420
        type:
          type: string
          description: Parsed transfer type.
          enum:
            - transfer
            - mint
            - burn
            - wrap
            - unwrap
            - changeOwner
            - withdrawWithheldFee
          example: transfer
        fromUserAccount:
          oneOf:
            - type: string
            - type: 'null'
          description: >-
            Wallet address that sent the tokens, or null when no sender exists.
            This field is always present.
          example: 7hPhaUpydpvm8wtiS3k4LPZKUmivQRs7YQmpE1hFshHx
        toUserAccount:
          oneOf:
            - type: string
            - type: 'null'
          description: >-
            Wallet address that received the tokens, or null when no recipient
            exists. This field is always present.
          example: 86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY
        fromTokenAccount:
          type: string
          description: >-
            Source token account. Omitted when not applicable, such as native
            SOL transfers.
          example: HcvK3EJ74iM9g11cUgsaPvLSrhCvCwcrWxBNd87LsC1x
        toTokenAccount:
          type: string
          description: >-
            Destination token account. Omitted when not applicable, such as
            native SOL transfers.
          example: CBcYniR9G9CN3zGMnwNE4SWbqkYWvCFVreEob9xHnQCY
        mint:
          type: string
          description: >-
            Token mint address. Native SOL uses
            So11111111111111111111111111111111111111111; WSOL uses
            So11111111111111111111111111111111111111112 when solMode is
            separate.
          example: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
        amount:
          type: string
          description: >-
            Raw transfer amount as a string to preserve precision. For
            fee-bearing Token-2022 transfers, this is the amount received by the
            destination.
          example: '2500000'
        feeAmount:
          type: string
          description: >-
            Transfer fee withheld by the Token-2022 transfer-fee extension.
            Present only on fee-bearing transfers. For fee-bearing transfers,
            the source is debited amount plus feeAmount, and the destination is
            credited amount.
          example: '13450000'
        decimals:
          type: integer
          description: Token decimals. Native SOL uses 9.
          example: 6
        uiAmount:
          type: string
          description: Human-readable amount.
          example: '2.5'
        feeUiAmount:
          type: string
          description: Human-readable fee amount. Present only when feeAmount is present.
          example: '134.5'
        confirmationStatus:
          type: string
          description: Confirmation status.
          enum:
            - finalized
            - confirmed
          example: finalized
        transactionIdx:
          type: integer
          description: Index of the transaction within the block.
          example: 35
        instructionIdx:
          type: integer
          description: Index of the instruction within the transaction.
          example: 1
        innerInstructionIdx:
          type: integer
          description: >-
            Index within inner instructions. Zero when the transfer is
            top-level.
          example: 0
      required:
        - signature
        - slot
        - blockTime
        - type
        - fromUserAccount
        - toUserAccount
        - mint
        - amount
        - decimals
        - uiAmount
        - confirmationStatus
        - transactionIdx
        - instructionIdx
        - innerInstructionIdx
      additionalProperties: false
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