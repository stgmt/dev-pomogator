---
paths:
  - "scripts/launch-claude-tui.ps1"
  - "**/*.ps1"
---

# Windows Terminal split-pane минимальный размер

`wt.exe split-pane -s <size>` имеет минимальный порог ~0.07 (7%). Ниже этого значения Windows Terminal не создаёт pane — открывает второе окно или pane исчезает.

## Пример из практики

```powershell
# ❌ -s 0.04 → Windows Terminal открывает ВТОРОЕ окно вместо split
wt.exe -d $dir cmd /k claude `; split-pane -H -s 0.04 -d $dir cmd /k python -m tui

# ❌ -s 0.06 → pane исчезает (создаётся но сразу коллапсирует)
wt.exe -d $dir cmd /k claude `; split-pane -H -s 0.06 -d $dir cmd /k python -m tui

# ✅ -s 0.07 → минимальный рабочий размер (~2 строки)
wt.exe -d $dir cmd /k claude `; split-pane -H -s 0.07 -d $dir cmd /k python -m tui
```

## Почему

Windows Terminal имеет внутренний минимум высоты pane (зависит от DPI/шрифта). При `size < минимум` поведение непредсказуемо: второе окно, коллапс, или игнорирование split. Ручной resize (Alt+Shift+Arrow) может уменьшить pane до 1 строки, но при создании через `wt.exe` минимум выше.

## Чеклист

- [ ] split-pane `-s` не меньше 0.07
- [ ] Для compact TUI достаточно 0.07 (1-2 строки контента)
- [ ] Программный resize pane после создания невозможен (WT limitation)
- [ ] Ручной resize: Alt+Shift+↑/↓
