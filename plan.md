# Viz-magic — duel incoming challenge UX plan

## Scope
- Сделать входящий вызов на дуэль заметным для target-аккаунта.
- Добавить клиентское уведомление и быстрый переход в нужный экран.
- Упростить принятие вызова из UI без необходимости догадываться зайти в арену.

## Non-goals
- Не менять duel protocol и blockchain action types.
- Не добавлять серверный push или внешний notification backend.
- Не переписывать полностью arena/duel flow beyond incoming challenge UX.

## Milestones
1. Проверить, где именно приходит `duel_challenge` и как target сейчас узнаёт о вызове.
2. Добавить уведомление для target-игрока.
3. Сделать автопереход в арену при входящем вызове.
4. Оставить быстрый accept flow из текущих экранов арены/дуэли.
5. Прогнать локальные проверки JS.

## Expected files or subsystems
- `app/js/ui/screens/arena.js`
- `app/js/ui/screens/duel.js`
- `app/js/i18n/ru.js`
- `app/js/i18n/en.js`

## Implementation tasks
- Подписаться на `duel_challenge` для текущего пользователя.
- Показать toast/announce с понятным текстом про входящий вызов.
- Автоматически переводить игрока в `arena`, где already existing accept UI доступен сразу.
- При желании усилить narrator/aria message для blind UX.

## Validation
- При входящем вызове target-аккаунт получает заметное уведомление.
- После вызова игрок автоматически попадает в экран арены или легко открывает его одним действием.
- Принятие вызова остаётся рабочим через существующий accept flow.
- `node --check` проходит для изменённых JS файлов.

## Risks or assumptions
- Событие `duel_challenge` уже есть в client event flow; используем его как primary trigger, а не low-level chain polling.
- Автопереход в `arena`, а не сразу в `duel`, снижает риск пропустить context и кнопки принятия.

## Definition of done
- Вызванный игрок реально узнаёт о дуэли без ручного похода по меню.
- Входящий duel challenge ведёт в понятный экран с возможностью принять вызов.
