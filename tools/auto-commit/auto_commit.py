#!/usr/bin/env python3
"""
Автоматический коммит с LLM-генерацией сообщений.
Срабатывает на UserPromptSubmit (Claude Code) / beforeSubmitPrompt (Cursor).
Коммитит не чаще чем раз в 15 минут (настраивается).
ВАЖНО: Никогда не блокирует работу IDE - всегда возвращает 0
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Tuple
from abc import ABC, abstractmethod

# Загрузка .env файла
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv не установлен, используем только os.environ


# === Настройка UTF-8 для Windows консоли ===
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        import codecs
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
        sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')
    except Exception:
        pass


# === Конфигурация ===
class Config:
    """Конфигурация через переменные окружения (.env файл)"""
    
    @staticmethod
    def _find_project_root() -> Path:
        """Определяет корень проекта по .git директории."""
        start_dir = Path.cwd().resolve()
        current = start_dir
        
        while current != current.parent:
            if (current / ".git").exists():
                return current
            current = current.parent
        
        return start_dir
    
    # Динамическое определение корня проекта
    WORKSPACE_DIR = _find_project_root.__func__()
    STATE_FILE = Path.home() / '.dev-pomogator' / 'auto-commit-state.json'
    
    # API конфигурация через env (aipomogator.ru по умолчанию)
    API_KEY = os.environ.get('AUTO_COMMIT_API_KEY')
    API_ENDPOINT = os.environ.get('AUTO_COMMIT_ENDPOINT', 'https://aipomogator.ru/go/v1/chat/completions')
    MODEL = os.environ.get('AUTO_COMMIT_MODEL', 'openrouter/deepseek/deepseek-v3.2')
    
    # Интервал между коммитами
    MIN_INTERVAL_MINUTES = int(os.environ.get('AUTO_COMMIT_INTERVAL', '15'))
    
    # Лог файл
    LOG_FILE = Path.home() / '.dev-pomogator' / 'logs' / 'auto-commits.log'
    
    @classmethod
    def is_configured(cls) -> bool:
        """Проверка что API ключ настроен."""
        return bool(cls.API_KEY)


# === Интерфейсы ===
class GitRepository(ABC):
    """Абстракция для работы с Git"""
    @abstractmethod
    def has_changes(self) -> bool:
        pass
    
    @abstractmethod
    def get_changes(self) -> Tuple[str, str]:
        pass
    
    @abstractmethod
    def commit(self, message: str) -> bool:
        pass


class MessageGenerator(ABC):
    """Абстракция для генерации сообщений коммита"""
    @abstractmethod
    def generate(self, status: str, diff: str) -> str:
        pass


class StateManager(ABC):
    """Абстракция для управления состоянием"""
    @abstractmethod
    def should_commit(self) -> bool:
        pass
    
    @abstractmethod
    def update_state(self) -> None:
        pass


# === Реализации ===
class SimpleGitRepo(GitRepository):
    """Простая реализация работы с Git"""
    
    def __init__(self, workspace: Path):
        self.workspace = workspace
    
    def has_changes(self) -> bool:
        """Проверка наличия изменений"""
        try:
            os.chdir(self.workspace)
            result = subprocess.run(
                ['git', 'status', '--porcelain'],
                capture_output=True, text=True
            )
            has_changes = bool(result.stdout.strip())
            self._log(f"Checking for changes: {has_changes}")
            return has_changes
        except Exception as e:
            self._log(f"Error checking changes: {str(e)}")
            return False
    
    def get_changes(self) -> Tuple[str, str]:
        """Получение изменений"""
        try:
            os.chdir(self.workspace)
            
            status = subprocess.run(
                ['git', 'status', '--short'],
                capture_output=True, text=True
            ).stdout
            
            diff = subprocess.run(
                ['git', 'diff', 'HEAD', '--stat'],
                capture_output=True, text=True  
            ).stdout
            
            return status, diff
        except Exception as e:
            self._log(f"Error getting changes: {str(e)}")
            return "", ""
    
    def commit(self, message: str) -> bool:
        """Создание коммита"""
        try:
            os.chdir(self.workspace)
            self._log(f"Starting commit with message: {message[:100]}...")
            
            # Git add
            add_result = subprocess.run(
                ['git', 'add', '.'], 
                capture_output=True, text=True
            )
            if add_result.returncode != 0:
                self._log(f"Git add failed: {add_result.stderr}")
                return False
            
            # Git commit
            commit_result = subprocess.run(
                ['git', 'commit', '-m', message],
                capture_output=True, text=True
            )
            if commit_result.returncode != 0:
                self._log(f"Git commit failed: {commit_result.stderr}")
                return False
            
            self._log(f"Commit successful")
            return True
        except Exception as e:
            self._log(f"Exception during commit: {str(e)}")
            return False
    
    def _log(self, message: str) -> None:
        """Логирование"""
        try:
            Config.LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().isoformat()
            with open(Config.LOG_FILE, 'a', encoding='utf-8') as f:
                f.write(f"{timestamp} | GIT | {message}\n")
        except:
            pass


class LLMMessageGenerator(MessageGenerator):
    """Генератор сообщений через LLM API"""
    
    def generate(self, status: str, diff: str) -> str:
        """Генерация commit message"""
        if not Config.is_configured():
            return self._generate_simple(status)
        
        try:
            return self._call_llm_api(status, diff)
        except Exception:
            return self._generate_simple(status)
    
    def _call_llm_api(self, status: str, diff: str) -> str:
        """Вызов LLM API"""
        try:
            import requests
            
            self._log(f"Calling LLM API: {Config.API_ENDPOINT}")
            self._log(f"Using model: {Config.MODEL}")
            
            prompt = f"""Проанализируй изменения в коде и создай commit message.

СПИСОК ИЗМЕНЕННЫХ ФАЙЛОВ:
{status[:3000]}

СТАТИСТИКА ИЗМЕНЕНИЙ:
{diff[:3000]}

ТРЕБОВАНИЯ:
1. Формат: type(scope): описание
2. Types: feat, fix, docs, style, refactor, test, chore, perf, ci
3. На русском языке
4. Кратко, 1-3 строки
5. Без эмодзи
6. НЕ указывай количество строк (+100, -50)

Ответь ТОЛЬКО готовым commit сообщением."""

            headers = {
                'Authorization': f'Bearer {Config.API_KEY}',
                'Content-Type': 'application/json'
            }
            
            data = {
                'model': Config.MODEL,
                'messages': [
                    {
                        'role': 'system',
                        'content': 'Ты эксперт по написанию git commit сообщений. Создавай краткие информативные сообщения.'
                    },
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ],
                'max_tokens': 500,
                'temperature': 0.2
            }
            
            response = requests.post(
                Config.API_ENDPOINT,
                headers=headers,
                json=data,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                choices = result.get('choices', [])
                if choices:
                    message = choices[0].get('message', {}).get('content', '').strip()
                    message = message.strip('"\'`')
                    if message:
                        self._log(f"Generated message: {message[:100]}...")
                        return message
            
            self._log(f"API error: {response.status_code}")
            return self._generate_simple(status)
                
        except Exception as e:
            self._log(f"LLM API error: {str(e)}")
            return self._generate_simple(status)
    
    def _log(self, message: str) -> None:
        """Логирование"""
        try:
            Config.LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().isoformat()
            with open(Config.LOG_FILE, 'a', encoding='utf-8') as f:
                f.write(f"{timestamp} | LLM | {message}\n")
        except:
            pass
    
    def _generate_simple(self, status: str) -> str:
        """Простая генерация без LLM"""
        lines = status.strip().split('\n') if status else []
        file_count = len(lines)
        
        if not lines:
            return "chore: автоматический коммит"
        
        first_line = lines[0] if lines else ""
        
        if '.md' in first_line:
            commit_type = "docs"
        elif '.feature' in first_line or 'test' in first_line:
            commit_type = "test"
        elif '.py' in first_line or '.ts' in first_line or '.js' in first_line:
            commit_type = "feat"
        else:
            commit_type = "chore"
        
        return f"{commit_type}: обновлено файлов: {file_count}"


class TimeBasedStateManager(StateManager):
    """Управление состоянием на основе времени"""
    
    def __init__(self, state_file: Path, interval_minutes: int):
        self.state_file = state_file
        self.interval = timedelta(minutes=interval_minutes)
    
    def should_commit(self) -> bool:
        """Проверка, прошло ли достаточно времени"""
        last_commit_time = self._read_last_commit_time()
        
        if last_commit_time is None:
            return True
        
        time_passed = datetime.now() - last_commit_time
        return time_passed >= self.interval
    
    def update_state(self) -> None:
        """Обновление времени последнего коммита"""
        state = {
            'last_commit': datetime.now().isoformat(),
            'pid': os.getpid()
        }
        
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(state))
    
    def _read_last_commit_time(self) -> Optional[datetime]:
        """Чтение времени последнего коммита"""
        try:
            if self.state_file.exists():
                data = json.loads(self.state_file.read_text())
                return datetime.fromisoformat(data['last_commit'])
        except:
            pass
        return None


class Logger:
    """Простой логгер"""
    
    def __init__(self, log_file: Path):
        self.log_file = log_file
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
    
    def log(self, message: str) -> None:
        """Запись в лог"""
        try:
            timestamp = datetime.now().isoformat()
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(f"{timestamp} | {message}\n")
        except:
            pass


class AutoCommitHandler:
    """Обработчик автоматических коммитов"""
    
    def __init__(
        self,
        repo: GitRepository,
        generator: MessageGenerator,
        state: StateManager,
        logger: Logger
    ):
        self.repo = repo
        self.generator = generator
        self.state = state
        self.logger = logger
    
    def handle(self) -> None:
        """Основная логика обработки"""
        self.logger.log("=== Starting auto-commit check ===")
        
        if not self.repo.has_changes():
            self.logger.log("No changes detected, skipping")
            return
        
        if not self.state.should_commit():
            self.logger.log(f"Too soon for commit ({Config.MIN_INTERVAL_MINUTES} min interval)")
            return
        
        self.logger.log("Getting changes for commit message generation")
        status, diff = self.repo.get_changes()
        
        self.logger.log("Generating commit message")
        message = self.generator.generate(status, diff)
        
        self.logger.log(f"Attempting commit")
        if self.repo.commit(message):
            self.state.update_state()
            self.logger.log(f"SUCCESS: Commit created")
            try:
                print(f"Auto-commit: {message[:80]}...")
            except:
                pass
        else:
            self.logger.log("FAILED: Could not create commit")


def main():
    """Главная функция"""
    try:
        workspace_dir = Config.WORKSPACE_DIR
        
        # Проверяем что директория существует и это git репо
        if not workspace_dir.exists() or not (workspace_dir / '.git').exists():
            sys.exit(0)
        
        # Создаем компоненты
        repo = SimpleGitRepo(workspace_dir)
        generator = LLMMessageGenerator()
        state = TimeBasedStateManager(Config.STATE_FILE, Config.MIN_INTERVAL_MINUTES)
        logger = Logger(Config.LOG_FILE)
        
        # Запускаем обработчик
        handler = AutoCommitHandler(repo, generator, state, logger)
        handler.handle()
        
    except Exception as e:
        # Логируем ошибку но НЕ блокируем IDE
        try:
            Config.LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now().isoformat()
            with open(Config.LOG_FILE, 'a', encoding='utf-8') as f:
                f.write(f"{timestamp} | CRITICAL | Hook error: {str(e)}\n")
        except:
            pass
    
    # ВСЕГДА возвращаем 0
    sys.exit(0)


if __name__ == "__main__":
    try:
        main()
    except:
        sys.exit(0)
