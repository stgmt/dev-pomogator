# Atomic Config Save

Конфиги должны сохраняться атомарно, чтобы избежать повреждений при сбое или конкуренции.

## Правильно

```typescript
const tempFile = path.join(configDir, 'config.json.tmp');
await fs.writeJson(tempFile, config, { spaces: 2 });
await fs.move(tempFile, configFile, { overwrite: true });
```

## Неправильно

```typescript
await fs.writeJson(configFile, config, { spaces: 2 });
```

## Чеклист

- [ ] Запись в temp‑файл
- [ ] Атомарная замена основного файла
- [ ] Права доступа выставляются после записи
