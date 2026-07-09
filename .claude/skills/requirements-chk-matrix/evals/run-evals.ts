#!/usr/bin/env npx tsx
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFormSkillEvalsCli } from '../../_shared/form-skill-evals.ts';

const __filename = fileURLToPath(import.meta.url);
const evalsDir = path.dirname(__filename);
process.exit(runFormSkillEvalsCli({ evalsDir, argv: process.argv.slice(2) }));
