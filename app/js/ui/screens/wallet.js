/**
 * Accessible MAGIC wallet. VT is shown only as the technical protocol label.
 */
var WalletScreen = (function() {
    'use strict';

    var PENDING_BURN_KEY = 'viz_magic_pending_burn_v1:';
    var historyOffset = 0;

    function _id(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000000).toString(36);
    }

    function _historyText(entry, account) {
        var amount = VTProtocol.formatAmount(entry.amountMilli || 0) + ' MAGIC';
        if (entry.type === 'mint') return 'Получено ' + amount + ' за подтверждённое сжигание VIZ';
        if (entry.type === 'transfer') return entry.from === account ? 'Отправлено ' + amount + ' → ' + entry.to : 'Получено ' + amount + ' ← ' + entry.from;
        if (entry.type === 'trade') return entry.buyer === account ? 'Покупка: −' + amount : 'Продажа: +' + amount;
        return 'Операция MAGIC ' + amount;
    }

    function render() {
        var root = Helpers.$('screen-wallet');
        if (!root) return;
        var user = VizAccount.getCurrentUser();
        if (!user) {
            root.innerHTML = '<div class="wallet-screen"><h1>Кошелёк</h1><p role="status">Войдите в Мир, чтобы открыть кошелёк.</p></div>';
            return;
        }
        var ledgerState = StateEngine.getState().magic;
        if (ledgerState && ledgerState.replayRequired) {
            root.innerHTML = '<div class="wallet-screen"><h1>Кошелёк</h1><p role="alert">Баланс MAGIC временно недоступен: требуется полный повтор подтверждённой истории VT. Отправка, сжигание и покупки заблокированы.</p></div>';
            return;
        }
        var balance = StateEngine.getMagicBalance(user);
        var pendingHistory = StateEngine.getMagicHistory(user, 0, 100);
        var historyPage = StateEngine.getMagicHistory(user, historyOffset, 51);
        var hasNextHistory = historyPage.length > 50;
        var history = historyPage.slice(0, 50);
        var pendingBurn = _pendingBurn(pendingHistory, user);
        var html = '<div class="wallet-screen">' +
            '<h1>Кошелёк</h1>' +
            '<p class="screen-intro">MAGIC — единственная игровая валюта. VT — технический протокол записи операций.</p>' +
            '<section class="card" aria-labelledby="wallet-balance-title"><h2 id="wallet-balance-title">Баланс MAGIC</h2>' +
            '<p class="wallet-balance" id="magic-balance" aria-live="polite">' + VTProtocol.formatAmount(balance) + ' MAGIC</p>' +
            '<p>Баланс меняется только после подтверждённых необратимых операций.</p></section>' +
            '<section class="card" aria-labelledby="wallet-mint-title"><h2 id="wallet-mint-title">Получить MAGIC</h2>' +
            '<p>Курс: 1.000 фактически сожжённого VIZ = 1.000 MAGIC. Сжигание необратимо; получатель VIZ — <code>null</code>.</p>' +
            '<form id="magic-mint-transfer-form"><label for="magic-mint-amount">Сумма VIZ</label>' +
            '<input id="magic-mint-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="1.000" required aria-describedby="magic-mint-help">' +
            '<p id="magic-mint-help">Жидкий перевод требует отдельно сохранённого active key и явного подтверждения.</p>' +
            '<label class="checkbox-label"><input id="magic-burn-consent" type="checkbox" required> Я понимаю, что сжигание VIZ необратимо</label>' +
            '<button class="btn btn-primary" type="submit"' + (VizAccount.hasActiveKey() && !pendingBurn ? '' : ' disabled aria-disabled="true"') + '>Сжечь VIZ и получить MAGIC</button></form>' +
            (pendingBurn ? '<p role="alert">Предыдущая операция сжигания ' + Helpers.escapeHtml(pendingBurn.amount) + ' VIZ ещё ожидает подтверждённой истории. Не повторяйте перевод.</p>' : '') +
            (VizAccount.hasActiveKey() ? '' : '<p role="status">Active key не подключён. Кошелёк не запрашивает и не сохраняет его автоматически.</p>') +
            '<details><summary>Fixed award (regular key)</summary><p>Энергетический лимит задаётся точно, но выпуск временно заблокирован: публичная история ещё не доказывает точное количество VIZ после vesting-округления. VIZ не будет сожжён без доказуемого начисления MAGIC.</p>' +
            '<button type="button" class="btn btn-secondary" disabled aria-disabled="true">Fixed award: доказательство недоступно</button></details></section>' +
            '<section class="card" aria-labelledby="wallet-send-title"><h2 id="wallet-send-title">Отправить MAGIC</h2>' +
            '<p>Перевод подписывается regular authority — это намеренная денежная власть внутри игры, не доступ к жидким VIZ.</p>' +
            '<form id="magic-send-form"><label for="magic-send-to">Аккаунт получателя</label><input id="magic-send-to" autocomplete="off" required>' +
            '<label for="magic-send-amount">Сумма MAGIC</label><input id="magic-send-amount" inputmode="decimal" autocomplete="off" placeholder="1.000" required>' +
            '<button class="btn btn-primary" type="submit">Подтвердить перевод</button></form></section>' +
            '<section class="card" aria-labelledby="wallet-history-title"><h2 id="wallet-history-title">Подтверждённая история</h2><ol class="wallet-history">';
        if (!history.length) html += '<li>Операций пока нет.</li>';
        for (var i = 0; i < history.length; i++) {
            html += '<li>' + Helpers.escapeHtml(_historyText(history[i], user)) + ' <span class="muted">#' + Number(history[i].blockNum || 0) + '</span></li>';
        }
        html += '</ol><nav class="wallet-history-nav" aria-label="Страницы истории">' +
            '<button type="button" id="wallet-history-prev" class="btn btn-secondary"' + (historyOffset > 0 ? '' : ' disabled aria-disabled="true"') + '>Новые</button>' +
            '<span>Операции ' + (history.length ? historyOffset + 1 : 0) + '–' + (historyOffset + history.length) + '</span>' +
            '<button type="button" id="wallet-history-next" class="btn btn-secondary"' + (hasNextHistory ? '' : ' disabled aria-disabled="true"') + '>Старые</button>' +
            '</nav></section><p class="protocol-note">Технический протокол: VT v1</p></div>';
        root.innerHTML = html;
        _bind(user);
    }

    function _pendingBurn(history, user) {
        var pending = null;
        var storageKey = PENDING_BURN_KEY + user;
        try { pending = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch (_) { pending = null; }
        if (!pending || !VTProtocol.validIntent(pending.intent) || VTProtocol.parseAmount(pending.amount) === null) return null;
        for (var i = 0; i < history.length; i++) {
            if (history[i].type === 'mint' && history[i].intent === pending.intent) {
                localStorage.removeItem(storageKey);
                return null;
            }
        }
        return pending;
    }

    function _bind(user) {
        var previousHistory = Helpers.$('wallet-history-prev');
        if (previousHistory) previousHistory.addEventListener('click', function() { historyOffset = Math.max(0, historyOffset - 50); render(); });
        var nextHistory = Helpers.$('wallet-history-next');
        if (nextHistory) nextHistory.addEventListener('click', function() { historyOffset += 50; render(); });
        var mintForm = Helpers.$('magic-mint-transfer-form');
        if (mintForm) mintForm.addEventListener('submit', function(event) {
            event.preventDefault();
            var amount = Helpers.$('magic-mint-amount').value;
            var milli = VTProtocol.parseAmount(amount);
            if (milli === null || !Helpers.$('magic-burn-consent').checked) {
                Toast.show('Укажите точную положительную сумму и подтвердите необратимость.', 'error');
                return;
            }
            var canonical = VTProtocol.formatAmount(milli);
            Modal.show({ title: 'Необратимо сжечь VIZ?', text: 'Будет отправлено ' + canonical + ' VIZ аккаунту null. После необратимого подтверждения выпуск составит ' + canonical + ' MAGIC по курсу 1:1. Требуется active key.', buttons: [
                { text: 'Сжечь ' + canonical + ' VIZ', className: 'btn-danger', action: function() {
                    var intent = _id('mint');
                    localStorage.setItem(PENDING_BURN_KEY + user, JSON.stringify({ intent: intent, amount: canonical, account: user }));
                    VizBroadcast.mintMagicTransfer(intent, canonical, function(err) {
                        Toast.show(err ? 'Статус операции неизвестен. Не повторяйте сжигание до проверки истории: ' + (err.message || err) : 'Операция отправлена. Не повторяйте её; MAGIC появится после необратимого подтверждения.', err ? 'error' : 'success');
                        render();
                    });
                } }
            ] });
        });

        var sendForm = Helpers.$('magic-send-form');
        if (sendForm) sendForm.addEventListener('submit', function(event) {
            event.preventDefault();
            var to = String(Helpers.$('magic-send-to').value || '').trim().toLowerCase();
            var amount = String(Helpers.$('magic-send-amount').value || '').trim();
            var milli = VTProtocol.parseAmount(amount);
            if (!VTProtocol.validAccount(to) || to === user || milli === null || StateEngine.getMagicBalance(user) < milli) {
                Toast.show('Проверьте аккаунт, точную сумму и баланс MAGIC.', 'error');
                return;
            }
            VizAccount.getAccount(to, function(accountErr) {
                if (accountErr) {
                    Toast.show('Аккаунт получателя не найден.', 'error');
                    return;
                }
                var canonical = VTProtocol.formatAmount(milli);
                Modal.show({ title: 'Отправить MAGIC?', text: 'Отправитель: ' + user + '. Получатель: ' + to + '. Сумма: ' + canonical + ' MAGIC. Подпись regular authority.', buttons: [
                    { text: 'Отправить ' + canonical + ' MAGIC', className: 'btn-primary', action: function() {
                        var action = VTProtocol.createTransferAction(to, canonical, _id('send'));
                        VizBroadcast.tokenAction(action, function(err) {
                            Toast.show(err ? 'Перевод не отправлен: ' + (err.message || err) : 'Перевод отправлен и появится после необратимого подтверждения.', err ? 'error' : 'success');
                        });
                    } }
                ] });
            });
        });
    }

    return { render: render };
})();
