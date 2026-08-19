#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Rail12306Provider } from './providers/rail12306.js';
import { createServer } from './server.js';
const server = createServer(new Rail12306Provider());
await server.connect(new StdioServerTransport());
