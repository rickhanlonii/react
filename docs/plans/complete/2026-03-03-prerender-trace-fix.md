# Unify SSR/Prerender Commit Path with Reconciler

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify SSR/prerender tree commit operations with the reconciler path so both converge at the same function, making timing work automatically.

**Architecture:** Extract a shared `commitTree()` method from `$$completeRoot` that handles layout → diff → mutations → sync → timing. Both the reconciler and SSR/prerender call it.

**Tech Stack:** Swift (Bindings, Root, ShadowTree), JavaScript (HostConfig.js)

---

See `/Users/rickhanlonii/.claude/plans/merry-imagining-papert.md` for full implementation details.
