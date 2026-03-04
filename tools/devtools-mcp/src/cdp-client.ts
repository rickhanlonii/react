/**
 * @license
 * Copyright 2026 Meta Platforms, Inc. and affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';

import WebSocket from 'ws';

import {logger} from './logger.js';

export interface CDPTarget {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type: string;
}

export interface CDPEventListener {
  (params: Record<string, unknown>): void;
}

export class CDPClient {
  #ws: WebSocket | null = null;
  #nextId = 1;
  #pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
    }
  >();
  #listeners = new Map<string, Set<CDPEventListener>>();
  #proxyUrl: string;
  #wsUrl: string | null = null;
  #connected = false;

  constructor(proxyUrl: string) {
    this.#proxyUrl = proxyUrl;
  }

  /** Discover targets via GET /json/list */
  async discoverTargets(): Promise<CDPTarget[]> {
    return new Promise((resolve, reject) => {
      const url = `${this.#proxyUrl}/json/list`;
      http
        .get(url, res => {
          let data = '';
          res.on('data', (chunk: string) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data) as CDPTarget[]);
            } catch (e) {
              reject(
                new Error(`Failed to parse /json/list response: ${data}`),
              );
            }
          });
        })
        .on('error', (err: Error) => {
          reject(
            new Error(
              `Cannot connect to inspector proxy at ${url}: ${err.message}`,
            ),
          );
        });
    });
  }

  /** Connect to the first available target */
  async connect(): Promise<void> {
    const targets = await this.discoverTargets();
    if (targets.length === 0) {
      throw new Error('No targets found at inspector proxy');
    }
    const target = targets[0];
    logger(`CDP: connecting to target "${target.title}" (${target.id})`);
    this.#wsUrl = target.webSocketDebuggerUrl;
    await this.#connectWs(this.#wsUrl);
  }

  /** Connect to a specific WebSocket URL */
  async #connectWs(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on('open', () => {
        this.#ws = ws;
        this.#connected = true;
        logger('CDP: WebSocket connected');
        resolve();
      });
      ws.on('message', (raw: WebSocket.RawData) => {
        this.#handleMessage(raw.toString());
      });
      ws.on('close', () => {
        this.#connected = false;
        logger('CDP: WebSocket disconnected');
      });
      ws.on('error', (err: Error) => {
        if (!this.#connected) {
          reject(err);
        } else {
          logger(`CDP: WebSocket error: ${err.message}`);
        }
      });
    });
  }

  /** Send a CDP command and return the result */
  async send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!this.#ws || !this.#connected) {
      await this.connect();
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, {resolve, reject});
      this.#ws!.send(JSON.stringify({id, method, params}));
    });
  }

  /** Register a listener for a CDP event (e.g. 'Tracing.dataCollected') */
  on(method: string, listener: CDPEventListener): void {
    let set = this.#listeners.get(method);
    if (!set) {
      set = new Set();
      this.#listeners.set(method, set);
    }
    set.add(listener);
  }

  /** Remove a listener */
  off(method: string, listener: CDPEventListener): void {
    this.#listeners.get(method)?.delete(listener);
  }

  /** Close the WebSocket connection */
  close(): void {
    this.#ws?.close();
    this.#ws = null;
    this.#connected = false;
  }

  get isConnected(): boolean {
    return this.#connected;
  }

  #handleMessage(raw: string): void {
    let msg: {
      id?: number;
      method?: string;
      result?: unknown;
      error?: {message: string};
      params?: Record<string, unknown>;
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Response to a command
    if (msg.id !== undefined && this.#pending.has(msg.id)) {
      const {resolve, reject} = this.#pending.get(msg.id)!;
      this.#pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message));
      } else {
        resolve(msg.result);
      }
      return;
    }

    // CDP event
    if (msg.method) {
      const listeners = this.#listeners.get(msg.method);
      if (listeners) {
        for (const listener of listeners) {
          listener(msg.params ?? {});
        }
      }
    }
  }
}
