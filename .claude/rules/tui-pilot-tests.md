# TUI Pilot Tests — No File Inspection

## Правило

Тесты для Textual TUI виджетов ДОЛЖНЫ использовать Textual Pilot API (`app.run_test()`, `pilot.press()`, `pilot.resize_terminal()`).

## Запрещено

- Тесты, которые читают .py файлы и проверяют наличие строк (`expect(content).toContain(...)`)
- Тесты, которые проверяют CSS rules как текст вместо реального применения
- Тесты, которые проверяют keybinding strings вместо нажатия клавиш

## Причина

File inspection тесты — ложнопозитивные: проходят даже если TUI полностью сломан. Pilot API тестирует реальное поведение в headless mode.

## Паттерн правильного теста

```python
@pytest.mark.asyncio
async def test_feature(make_app):
    app = make_app()
    async with app.run_test(size=(80, 24)) as pilot:
        await pilot.press("m")
        await pilot.pause()
        assert app.screen.has_class("compact")
```

## Чеклист

- [ ] Тест использует `run_test()` + `pilot`
- [ ] Тест проверяет поведение, не текст в файле
- [ ] Тест включает `await pilot.pause()` после действий
