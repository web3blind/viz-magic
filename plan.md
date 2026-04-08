# Viz-magic — duel opponent resolution + blessing UX plan

## Scope
- Восстановить и зафиксировать корректный источник истины для участников дуэли во всех UI-переходах.
- Убрать stale/local-state путаницу в duel screen и подтягивать реальные данные противника, когда они есть на chain/grimoire.
- Проверить blessing flow на предмет реального level restriction и, если ограничения нет, сделать UX хроники понятным для низких уровней.
- Сохранить все уже внесённые изменения по guild / inventory / chronicle feed cleanup.

## Non-goals
- Не откатывать текущий `main`.
- Не менять on-chain duel/blessing protocol без необходимости.
- Не возвращать mixed activity feed в Chronicle.

## Milestones
1. Проследить duel flow: `challenge -> accept -> state -> render pre-duel/active duel`.
2. Привязать duel UI к canonical duel participants из chain state, а не к устаревшему локальному экранному state.
3. Добавить безопасную догрузку character/grimoire данных для opponent, если локальный state их ещё не знает.
4. Проверить blessing flow и явно отразить в UX, что blessing доступен через Chronicle posts других магов.
5. Прогнать `node --check` для изменённых файлов, затем commit + push в `main`.

## Expected files or subsystems
- `app/js/ui/screens/duel.js`
- `app/js/ui/screens/chronicle.js`
- `app/js/i18n/ru.js`
- `app/js/i18n/en.js`

## Implementation tasks
- В duel screen вычислять opponent из `duel.challenger/duel.target` при наличии state-дуэли.
- При отсутствии локального character state для участника пробовать восстановить его из chain grimoire и перерендерить экран.
- Убрать misleading blessing CTA там, где благословить нельзя (например, свой же пост).
- Добавить понятное объяснение в Chronicle, когда в ленте нет чужих постов для blessing.

## Validation
- Duel pre-screen и active duel показывают корректного opponent и его реальные name/class/level, если данные есть на chain.
- Экран дуэли больше не зависит от stale `opponent` fallback как от основного источника истины.
- В коде нет level-based restriction для blessing.
- Chronicle явно объясняет, что blessing работает через posts, и не предлагает bless на собственных записях.
- `node --check` проходит для изменённых файлов.

## Risks or assumptions
- Если у opponent нет grimoire на chain или node не вернёт account metadata, UI останется на account fallback, но это будет уже честный degradation path.
- Chronicle по-прежнему зависит от наличия реальных posts; если никто не пишет, blessable targets не появятся.

## Definition of done
- Duel bug исправлен на уровне источника данных, а не замаскирован.
- Blessing UX не создаёт ложное ощущение level cap и явно объясняет модель через Chronicle posts.
- Изменения проверены синтаксически и отправлены в `main`.
