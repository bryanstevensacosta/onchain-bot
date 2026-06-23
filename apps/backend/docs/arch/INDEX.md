# Hexagonal Architecture + DDD + Bounded Contexts

## Overview
Documentation for building modular, decoupled systems using Domain-Driven Design, Bounded Contexts, and Hexagonal Architecture.

## Structure

```
docs/arch/
├── INDEX.md                 # This file
├── 01-principles.md         # Core principles overview
├── 02-bounded-contexts.md   # Bounded Contexts explained
├── 03-hexagonal.md          # Hexagonal Architecture
├── 04-domain-layer.md       # Domain: entities, value objects, rules
├── 05-application-layer.md  # Application: use cases, ports
├── 06-adapters-layer.md     # Adapters: controllers, repos, APIs
├── 07-bc-communication.md   # Context mapping, events, protocols
├── 08-file-structure.md     # Directory structure by BC
├── 09-anti-patterns.md      # Common mistakes
├── 10-testing.md            # Testing strategies
└── 11-why.md                # When to use this architecture
```

## Core Idea

> The domain is the heart of the system. Everything else (DB, APIs, UI, brokers) is replaceable.
