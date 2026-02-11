---
name: research-nextjs-flight
description: Research how Next.js serves RSC Flight responses. Run this to understand HTTP format, headers, and streaming behavior.
---

# Research: Next.js Flight Format

## Objective

Analyze how Next.js serves Flight responses — the HTTP format, content type, headers, streaming behavior, and any Next.js-specific extensions to the Flight protocol.

## Input Files

1. `../async-react/` — Working Next.js RSC app. Run it and inspect network traffic.
2. `../async-react/app/` — App router pages (examine RSC usage patterns)
3. `../async-react/next.config.ts` — Next.js configuration

## Instructions

1. Examine `../async-react/` to understand the app structure
2. Read `../async-react/app/layout.tsx` and key pages to see RSC patterns used
3. Research (web) how Next.js App Router serves Flight:
   - What HTTP endpoint serves the RSC payload (usually same URL with `RSC: 1` header or `?_rsc=` param)
   - What `Content-Type` header is used
   - How streaming is implemented (chunked transfer encoding)
   - How client references are encoded (webpack/turbopack module IDs)
   - How server actions are invoked (POST requests with Flight encoding)
4. Document the differences between what Next.js sends vs. raw React Flight
5. Identify what our native client needs to send/receive to communicate with Next.js

## Output

Write to: `docs/research/nextjs-flight.md`

Format:
- HTTP request/response examples (headers + body snippets)
- Content-Type and streaming format
- Client reference format (how Next.js encodes module IDs)
- What headers the native client must send
- Server action invocation format
- Differences from raw React Flight

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Next.js Flight format"
