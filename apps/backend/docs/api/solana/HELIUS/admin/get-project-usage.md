> ## Documentation Index
> Fetch the complete documentation index at: https://www.helius.dev/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# Get Project Usage

> Retrieve credit usage, subscription details, and per-service request counts for a project within the current billing cycle.

## Overview

Returns a complete picture of a project's credit consumption for the current billing cycle, including credits remaining, subscription plan details, and a breakdown of requests by service type (RPC, DAS, gRPC, WebSocket, etc.).

## Request Parameters

<ParamField path="id" type="string" required>
  The project ID to retrieve usage for. Must match the project associated with the API key used for authentication.
</ParamField>

## Response Fields

<ParamField body="creditsRemaining" type="number">
  Credits remaining in the current billing cycle. Calculated as the plan's credit limit minus regular credits consumed, floored at zero.
</ParamField>

<ParamField body="creditsUsed" type="number">
  Total credits consumed in the current billing cycle, including both regular and prepaid credits.
</ParamField>

<ParamField body="prepaidCreditsRemaining" type="number">
  Prepaid credits still available.
</ParamField>

<ParamField body="prepaidCreditsUsed" type="number">
  Prepaid credits consumed in the current billing cycle.
</ParamField>

<ParamField body="subscriptionDetails" type="object">
  Subscription plan and billing cycle information.
</ParamField>

<ParamField body="subscriptionDetails.billingCycle.start" type="string">
  Billing cycle start date in `YYYY-MM-DD` format.
</ParamField>

<ParamField body="subscriptionDetails.billingCycle.end" type="string">
  Billing cycle end date in `YYYY-MM-DD` format.
</ParamField>

<ParamField body="subscriptionDetails.creditsLimit" type="number">
  Total credit allowance for the billing cycle based on your plan.
</ParamField>

<ParamField body="subscriptionDetails.plan" type="string">
  The name of the subscription plan (e.g., `"business"`, `"professional"`).
</ParamField>

<ParamField body="usage" type="object">
  Request counts broken down by service type. Each field is the total number of requests made to that service during the current billing cycle.
</ParamField>

<ParamField body="usage.api" type="number">
  Enhanced API requests (e.g., parsed transactions, token metadata).
</ParamField>

<ParamField body="usage.archival" type="number">
  Archival RPC requests.
</ParamField>

<ParamField body="usage.das" type="number">
  DAS (Digital Asset Standard) API requests.
</ParamField>

<ParamField body="usage.grpc" type="number">
  gRPC streaming requests.
</ParamField>

<ParamField body="usage.grpcGeyser" type="number">
  Geyser gRPC requests.
</ParamField>

<ParamField body="usage.photon" type="number">
  ZK Compression (Photon) requests.
</ParamField>

<ParamField body="usage.rpc" type="number">
  Standard Solana RPC requests.
</ParamField>

<ParamField body="usage.stream" type="number">
  LaserStream data streaming requests.
</ParamField>

<ParamField body="usage.webhook" type="number">
  Webhook delivery events.
</ParamField>

<ParamField body="usage.websocket" type="number">
  WebSocket subscription requests.
</ParamField>

## Request Parameters

<ParamField body="id" type="string" required>
  The project ID to retrieve usage for. Must match the project associated with the API key.
</ParamField>


## OpenAPI

````yaml openapi/admin-api/getProjectUsage.yaml GET /v0/admin/projects/{id}/usage
openapi: 3.0.3
info:
  title: Helius Admin API
  description: |
    Programmatic access to project usage and billing data.

    ## Authentication

    All requests require an API key passed either as:
    - Header: `X-Api-Key: YOUR_API_KEY`
    - Query parameter: `?api-key=YOUR_API_KEY`
  version: 1.0.0
  contact:
    name: API Support
    url: https://helius.dev
servers:
  - url: https://admin-api.helius.xyz
    description: Production server
security:
  - ApiKeyQuery: []
  - ApiKeyHeader: []
paths:
  /v0/admin/projects/{id}/usage:
    get:
      tags:
        - Admin
      summary: Get Project Usage
      description: >
        Retrieve credit usage, subscription details, and per-service request
        counts for a project within the current billing cycle.


        The API key used for authentication must belong to the project specified
        in the path. Requests where the API key's project does not match the
        `id` parameter will return a `400` error.
      operationId: getProjectUsage
      parameters:
        - name: id
          in: path
          required: true
          description: >-
            The project ID to retrieve usage for. Must match the project
            associated with the API key.
          schema:
            type: string
            format: uuid
            example: a1b2c3d4-e5f6-7890-abcd-ef1234567890
      responses:
        '200':
          description: Project usage retrieved successfully.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ProjectUsageResponse'
              example:
                creditsRemaining: 487500
                creditsUsed: 12500
                prepaidCreditsRemaining: 50000
                prepaidCreditsUsed: 0
                subscriptionDetails:
                  billingCycle:
                    start: '2026-04-01'
                    end: '2026-05-01'
                  creditsLimit: 500000
                  plan: business
                usage:
                  api: 1200
                  archival: 0
                  das: 5000
                  grpc: 300
                  grpcGeyser: 0
                  photon: 0
                  rpc: 4500
                  stream: 100
                  webhook: 800
                  websocket: 600
        '400':
          description: >-
            Bad Request — the project ID in the path does not match the project
            associated with the API key.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                statusCode: 400
                message: Invalid project id
                error: Bad Request
        '401':
          description: Unauthorized — API key is missing, malformed, or not found.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                statusCode: 401
                message: Missing or invalid API key
                error: Unauthorized
        '403':
          description: Forbidden — the Admin API is not enabled for this project.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                statusCode: 403
                message: Admin API not enabled for this project
                error: Forbidden
        '429':
          description: Too Many Requests — rate limit of 5 requests per second exceeded.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                statusCode: 429
                message: 'ThrottlerException: Too Many Requests'
                error: Too Many Requests
        '500':
          description: >-
            Internal Server Error — a server-side error occurred (e.g., missing
            billing data).
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
              example:
                statusCode: 500
                message: Internal server error
                error: Internal Server Error
components:
  schemas:
    ProjectUsageResponse:
      type: object
      properties:
        creditsRemaining:
          type: number
          description: >-
            Number of credits remaining in the current billing cycle. Calculated
            as `creditsLimit - regularCreditsUsed`, floored at 0.
          example: 487500
        creditsUsed:
          type: number
          description: >-
            Total credits consumed in the current billing cycle, including both
            regular and prepaid credits.
          example: 12500
        prepaidCreditsRemaining:
          type: number
          description: Number of prepaid credits remaining.
          example: 50000
        prepaidCreditsUsed:
          type: number
          description: Number of prepaid credits consumed in the current billing cycle.
          example: 0
        subscriptionDetails:
          type: object
          description: >-
            Details about the project's subscription plan and current billing
            cycle.
          properties:
            billingCycle:
              type: object
              description: Start and end dates of the current billing cycle.
              properties:
                start:
                  type: string
                  description: Billing cycle start date.
                  example: '2026-04-01'
                end:
                  type: string
                  description: Billing cycle end date.
                  example: '2026-05-01'
            creditsLimit:
              type: number
              description: >-
                Total credit allowance for the current billing cycle based on
                the plan.
              example: 500000
            plan:
              type: string
              description: The name of the subscription plan.
              example: business
        usage:
          type: object
          description: >-
            Request counts broken down by service type for the current billing
            cycle.
          properties:
            api:
              type: number
              description: >-
                Number of Enhanced API requests (e.g., parsed transactions,
                token metadata).
              example: 1200
            archival:
              type: number
              description: Number of archival RPC requests.
              example: 0
            das:
              type: number
              description: Number of DAS (Digital Asset Standard) API requests.
              example: 5000
            grpc:
              type: number
              description: Number of gRPC streaming requests.
              example: 300
            grpcGeyser:
              type: number
              description: Number of Geyser gRPC requests.
              example: 0
            photon:
              type: number
              description: Number of ZK Compression (Photon) requests.
              example: 0
            rpc:
              type: number
              description: Number of standard Solana RPC requests.
              example: 4500
            stream:
              type: number
              description: Number of LaserStream data streaming requests.
              example: 100
            webhook:
              type: number
              description: Number of webhook delivery events.
              example: 800
            websocket:
              type: number
              description: Number of WebSocket subscription requests.
              example: 600
    ErrorResponse:
      type: object
      properties:
        statusCode:
          type: integer
          description: HTTP status code.
        message:
          type: string
          description: Human-readable error message.
        error:
          type: string
          description: HTTP error name.
  securitySchemes:
    ApiKeyQuery:
      type: apiKey
      in: query
      name: api-key
      description: API key passed as a query parameter.
    ApiKeyHeader:
      type: apiKey
      in: header
      name: X-Api-Key
      description: API key passed as a request header.

````