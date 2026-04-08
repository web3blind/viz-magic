# Viz-magic — chronicle posts-only cleanup plan

## Scope
- Вернуть хронику к исходной модели: лента постов пользователей, а не mixed activity feed.
- Убрать игровые события и bless/award narrative из основной ленты хроники.
- Сохранить кнопку благословения как действие под постом.

## Non-goals
- Не трогать VoiceProtocol и storage формат пользовательских постов.
- Не проектировать отдельную activity-вкладку в этом проходе.
- Не ломать compose/send flow и bless action под постом.

## Milestones
1. Зафиксировать источник истины для хроники: посты из voice/publication + локально отправленные post entries.
2. Убрать сбор recentActions/duel history в основной feed.
3. Оставить табы working поверх post-only набора.
4. Прогнать локальные проверки JS.

## Expected files or subsystems
- `app/js/ui/screens/chronicle.js`

## Implementation tasks
- Оставить в ленте только `chronicle_post` и voice/publication entries с required tag.
- Не рендерить blessing/hunt/rest/duel как feed entries.
- Сохранить локальный optimistic post injection после отправки пользователем.

## Validation
- В хронике больше не появляются bless/award/hunt/duel/rest записи.
- Пользовательские посты по-прежнему видны.
- Кнопка благословения под постом остаётся рабочей.
- `node --check` проходит для изменённых JS файлов.

## Risks or assumptions
- Временный optimistic local post живёт в `recentActions`, но фильтруется только как `chronicle_post`.
- Если потом понадобится activity feed, его лучше делать отдельным экраном/вкладкой, не в основной хронике.

## Definition of done
- Хроника снова воспринимается как лента постов.
- Игровые события больше не засоряют social feed.
