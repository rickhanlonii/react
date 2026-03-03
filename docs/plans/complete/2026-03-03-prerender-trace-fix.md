# Unify SSR/Prerender Commit Path via Renderer Model

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify SSR/prerender tree commit operations with the reconciler path so both converge at the same function, making timing work automatically.

**Architecture:** Extract a `Renderer` model (one per Root) that owns the commit pipeline. Both the reconciler and SSR/prerender call `renderer.commitTree()`.

**Tech Stack:** Swift (Bindings, Root, ShadowTree), JavaScript (HostConfig.js)

---

Full plan: `/Users/rickhanlonii/.claude/plans/merry-imagining-papert.md`
