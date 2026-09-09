#!/usr/bin/env node
// slitex CLI entry — npm makes this available on PATH on `npm install -g`.
import { execute } from "@oclif/core";

await execute({ dir: import.meta.url });
