import type { Config } from '../config/schema.js';

export function shouldCheckUpdate(config: Config): boolean {
  if (!config.lastCheck) {
    return true;
  }
  
  const lastCheck = new Date(config.lastCheck);
  const now = new Date();
  const hoursSinceLastCheck = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);
  
  return hoursSinceLastCheck >= config.cooldownHours;
}

export function getTimeUntilNextCheck(config: Config): number {
  if (!config.lastCheck) {
    return 0;
  }
  
  const lastCheck = new Date(config.lastCheck);
  const nextCheck = new Date(lastCheck.getTime() + config.cooldownHours * 60 * 60 * 1000);
  const now = new Date();
  
  return Math.max(0, nextCheck.getTime() - now.getTime());
}
