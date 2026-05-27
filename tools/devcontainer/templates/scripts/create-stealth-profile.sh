#!/bin/bash
# Создаёт Firefox stealth profile с anti-detect настройками
# Profile: /tmp/firefox-stealth/
# Запуск: firefox-esr --profile /tmp/firefox-stealth --no-remote <url>
set -euo pipefail

PROFILE_DIR="/tmp/firefox-stealth"
mkdir -p "$PROFILE_DIR"

cat > "$PROFILE_DIR/user.js" << 'USERJS'
// === User-Agent: Chrome 131 на Linux ===
user_pref("general.useragent.override", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");

// === Платформа ===
user_pref("general.platform.override", "Linux x86_64");
user_pref("general.appversion.override", "5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
user_pref("general.oscpu.override", "Linux x86_64");
user_pref("general.buildID.override", "20181001000000");

// === Отключить детекцию автоматизации ===
user_pref("dom.webdriver.enabled", false);
user_pref("marionette.enabled", false);
user_pref("devtools.debugger.remote-enabled", false);

// === Accept headers как у Chrome ===
user_pref("network.http.accept.default", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7");
user_pref("intl.accept_languages", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7");
user_pref("network.http.sendRefererHeader", 2);

// === WebGL: реалистичный GPU ===
user_pref("webgl.disabled", false);
user_pref("webgl.renderer-string-override", "ANGLE (Intel, Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)");
user_pref("webgl.vendor-string-override", "Google Inc. (Intel)");

// === Canvas/Fingerprint: не блокировать ===
user_pref("privacy.resistFingerprinting", false);
user_pref("privacy.trackingprotection.enabled", false);
user_pref("privacy.trackingprotection.fingerprinting.enabled", false);
user_pref("privacy.trackingprotection.cryptomining.enabled", false);

// === TLS: отключить старые cipher suites ===
user_pref("security.tls.version.min", 1);
user_pref("security.tls.version.max", 4);
user_pref("security.ssl3.dhe_rsa_aes_128_sha", false);
user_pref("security.ssl3.dhe_rsa_aes_256_sha", false);
user_pref("security.ssl3.ecdhe_ecdsa_aes_128_sha", false);
user_pref("security.ssl3.ecdhe_rsa_aes_128_sha", false);

// === Отключить Firefox-специфичные фичи ===
user_pref("dom.push.enabled", false);
user_pref("dom.mozContacts.enabled", false);
user_pref("dom.battery.enabled", false);
user_pref("media.peerconnection.enabled", true);
user_pref("media.navigator.enabled", true);
user_pref("general.useragent.compatMode.firefox", false);

// === Отключить мусор первого запуска ===
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.enabled", false);
user_pref("browser.newtabpage.activity-stream.feeds.telemetry", false);
user_pref("browser.tabs.warnOnClose", false);

// === Allow unsigned extensions ===
user_pref("xpinstall.signatures.required", false);
user_pref("extensions.langpacks.signatures.required", false);
user_pref("extensions.experiments.enabled", true);
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
USERJS

echo "Firefox stealth profile created: $PROFILE_DIR"
