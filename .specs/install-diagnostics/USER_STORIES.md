# User Stories

- Как разработчик dev-pomogator, я хочу иметь Linux control-test для npx-установки (CORE003_18), чтобы убедиться что happy path установки через `npx github:stgmt/dev-pomogator` работает в Docker CI на каждом коммите.
- Как разработчик dev-pomogator, я хочу regression Windows-тест (CORE003_19), который фиксирует known silent install failure через failing assertions, чтобы будущий fix-коммитер сразу видел что bug-сценарий покрыт автоматизированной проверкой.
- Как пользователь dev-pomogator на Windows, я хочу чтобы регрессия "молчаливый install" не вернулась после fix-а bug-а, чтобы не оказаться в тупике без диагностики и без понимания что произошло.
- Как пользователь dev-pomogator, столкнувшийся с silent install failure прямо сейчас, я хочу запустить slash-command `/install-diagnostics`, чтобы получить root cause + рекомендованный workaround вместо того чтобы гадать.
