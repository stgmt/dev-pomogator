#!/usr/bin/env node

import { checkUpdate } from '../dist/updater/index.js';

checkUpdate({ silent: true }).catch(() => {
  // Silent fail - don't interrupt user workflow
});
