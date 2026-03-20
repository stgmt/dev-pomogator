/**
 * Cursor Summarize Hook Wrapper
 *
 * Этот скрипт решает проблему "Missing transcriptPath" для Cursor:
 * 1. Читает conversation_id из hook input
 * 2. Извлекает последнее сообщение assistant из SQLite
 * 3. Вызывает claude-mem API напрямую с last_assistant_message
 *
 * Cursor хранит сообщения в:
 * %APPDATA%\Cursor\User\globalStorage\state.vscdb
 * Таблица: cursorDiskKV
 * Ключ: bubbleId:<conversation_id>:<bubble_id>
 */
import Database from 'bun:sqlite';
import path from 'path';
import os from 'os';
const WORKER_PORT = 37777;
/**
 * Get path to Cursor's globalStorage SQLite database
 */
function getGlobalStoragePath() {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}
/**
 * Extract last assistant message from Cursor's SQLite database
 */
function getLastAssistantMessage(conversationId) {
    const dbPath = getGlobalStoragePath();
    try {
        const db = new Database(dbPath, { readonly: true });
        // Get all bubbles for this conversation
        const bubbles = db.query("SELECT value FROM cursorDiskKV WHERE key LIKE ? ORDER BY key DESC").all(`bubbleId:${conversationId}:%`);
        db.close();
        if (bubbles.length === 0) {
            console.error(`[cursor-summarize] No messages found for conversation: ${conversationId}`);
            return null;
        }
        // Find last assistant message (type=2) with non-empty text
        for (const row of bubbles) {
            try {
                const data = JSON.parse(row.value.toString());
                if (data.type === 2 && data.text && data.text.trim().length > 0) {
                    // Limit message size to avoid memory issues
                    const maxLength = 50000;
                    const text = data.text.length > maxLength
                        ? data.text.slice(-maxLength) // Take last N chars
                        : data.text;
                    return text;
                }
            }
            catch {
                // Skip malformed entries
            }
        }
        console.error(`[cursor-summarize] No assistant messages found for conversation: ${conversationId}`);
        return null;
    }
    catch (err) {
        console.error(`[cursor-summarize] Error reading Cursor database:`, err);
        return null;
    }
}
/**
 * Call claude-mem summarize API directly
 */
async function callSummarizeApi(conversationId, lastAssistantMessage) {
    const url = `http://127.0.0.1:${WORKER_PORT}/api/sessions/summarize`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contentSessionId: conversationId,
                last_assistant_message: lastAssistantMessage || undefined,
            }),
        });
        if (!response.ok) {
            const text = await response.text();
            console.error(`[cursor-summarize] API error: ${response.status} ${text}`);
            return;
        }
        const result = await response.json();
        console.log(`[cursor-summarize] Summary queued:`, result);
    }
    catch (err) {
        console.error(`[cursor-summarize] Failed to call summarize API:`, err);
    }
}
/**
 * Main entry point
 */
async function main() {
    // Read hook input from stdin
    let inputData = '';
    for await (const chunk of Bun.stdin.stream()) {
        inputData += new TextDecoder().decode(chunk);
    }
    if (!inputData.trim()) {
        console.error('[cursor-summarize] No input received');
        process.exit(1);
    }
    let input;
    try {
        input = JSON.parse(inputData);
    }
    catch {
        console.error('[cursor-summarize] Invalid JSON input');
        process.exit(1);
    }
    const conversationId = input.conversation_id;
    if (!conversationId) {
        console.error('[cursor-summarize] Missing conversation_id in input');
        process.exit(1);
    }
    console.log(`[cursor-summarize] Processing conversation: ${conversationId}`);
    // Extract last assistant message from Cursor's SQLite
    const lastMessage = getLastAssistantMessage(conversationId);
    if (lastMessage) {
        console.log(`[cursor-summarize] Found last message (${lastMessage.length} chars)`);
    }
    else {
        console.log(`[cursor-summarize] No last message found, will summarize without it`);
    }
    // Call claude-mem API
    await callSummarizeApi(conversationId, lastMessage);
}
main().catch((err) => {
    console.error('[cursor-summarize] Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=cursor-summarize.js.map