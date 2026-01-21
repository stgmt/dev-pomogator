#!/usr/bin/env node

/**
 * Auto-update script for dev-pomogator.
 * Called by Cursor stop hook.
 * Checks cooldown and fetches updates from GitHub if needed.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(os.homedir(), '.dev-pomogator');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveConfig(config) {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {}
}

function shouldUpdate(config) {
  if (!config || !config.autoUpdate) return false;
  if (!config.lastCheck) return true;
  
  const lastCheck = new Date(config.lastCheck);
  const now = new Date();
  const hours = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);
  const cooldown = config.cooldownHours || 24;
  
  return hours >= cooldown;
}

async function checkAndUpdate() {
  const config = loadConfig();
  
  if (!shouldUpdate(config)) {
    return;
  }
  
  // Try to use the compiled updater module
  const updaterPath = path.join(__dirname, '..', 'dist', 'updater', 'index.js');
  
  if (fs.existsSync(updaterPath)) {
    try {
      // Dynamic import for ESM module
      const updaterModule = await import(updaterPath);
      await updaterModule.checkUpdate({ silent: true });
      return;
    } catch (e) {
      // Fallback: just update lastCheck if updater fails
      console.error('Updater failed:', e.message);
    }
  }
  
  // Fallback: update lastCheck only (updater not available)
  if (config) {
    config.lastCheck = new Date().toISOString();
    saveConfig(config);
  }
}

// Run and output continue signal for Cursor hook
checkAndUpdate()
  .catch(() => {})
  .finally(() => {
    // Signal Cursor to continue
    process.stdout.write(JSON.stringify({ continue: true }));
  });
