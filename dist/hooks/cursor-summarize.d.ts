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
export {};
//# sourceMappingURL=cursor-summarize.d.ts.map