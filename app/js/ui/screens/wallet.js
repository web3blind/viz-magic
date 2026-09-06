/**
 * Accessible MAGIC wallet. VT is shown only as the technical protocol label.
 */
var WalletScreen = (function() {
    'use strict';

    var PENDING_MINT_KEY = 'viz_magic_pending_burn_v1:';
    var historyOffset = 0;

    function _id(prefix) {
        return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1000000).toString(36);
    }

    function _historyText(entry, account) {
        var amount = VTProtocol.formatAmount(entry.amountMilli || 0) + ' MAGIC';
        if (entry.type === 'mint') return 'Получено ' + amount + ' за подтверждённое направление VIZ аккаунту null';
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
        var pendingMint = _pendingMint(pendingHistory, user);
        var html = '<div class="wallet-screen">' +
            '<h1>Кошелёк</h1>' +
            '<p class="screen-intro">MAGIC — единственная игровая валюта. VT — технический протокол записи операций.</p>' +
            '<section class="card" aria-labelledby="wallet-balance-title"><h2 id="wallet-balance-title">Баланс MAGIC</h2>' +
            '<p class="wallet-balance" id="magic-balance" aria-live="polite">' + VTProtocol.formatAmount(balance) + ' MAGIC</p>' +
            '<p>Баланс меняется только после подтверждённых необратимых операций.</p></section>' +
            '<section class="card" aria-labelledby="wallet-mint-title"><h2 id="wallet-mint-title">Получить MAGIC</h2>' +
            '<p>Курс протокола: 1.000 подтверждённого VIZ, направленного аккаунту <code>null</code>, = 1.000 MAGIC. Операция необратима.</p>' +
            '<form id="magic-mint-fixed-form"><h3>Fixed award — regular key</h3>' +
            '<label for="magic-fixed-amount">Сумма VIZ и будущий выпуск MAGIC</label>' +
            '<input id="magic-fixed-amount" name="fixedAmount" inputmode="decimal" autocomplete="off" placeholder="1.000" required aria-describedby="magic-fixed-help">' +
            '<label for="magic-fixed-energy">Максимум энергии, 1–10000</label>' +
            '<input id="magic-fixed-energy" name="maxEnergy" type="number" min="1" max="10000" step="1" value="1000" required aria-describedby="magic-fixed-help">' +
            '<p id="magic-fixed-help">Fixed award подписывается regular key. Указанная сумма — точная номинальная аллокация; такой же выпуск MAGIC появится только после необратимого подтверждения.</p>' +
            '<label class="checkbox-label"><input id="magic-fixed-consent" type="checkbox" required> Я понимаю, что VIZ будут необратимо направлены аккаунту null</label>' +
            '<button class="btn btn-primary" type="submit"' + (!pendingMint ? '' : ' disabled aria-disabled="true"') + '>Направить VIZ и получить MAGIC</button></form>' +
            (pendingMint ? '<p role="alert">Предыдущая операция ' + Helpers.escapeHtml(pendingMint.amount) + ' VIZ ещё ожидает подтверждённой истории. Не повторяйте её.</p>' : '') +
            '<details><summary>Обычный award — статус доказательства</summary><p>Обычный award разрешён правилами VT, но пока недоступен для отправки: подтверждение <code>receive_award</code> содержит SHARES, а не точную историческую сумму VIZ. Кошелёк не показывает оценку как обещанный выпуск.</p>' +
            '<button type="button" class="btn btn-secondary" disabled aria-disabled="true">Обычный award: точная сумма VIZ недоступна</button></details>' +
            '<details><summary>Жидкий перевод VIZ — active key</summary>' +
            '<form id="magic-mint-transfer-form"><label for="magic-mint-amount">Сумма VIZ</label>' +
            '<input id="magic-mint-amount" name="amount" inputmode="decimal" autocomplete="off" placeholder="1.000" required aria-describedby="magic-mint-help">' +
            '<p id="magic-mint-help">Жидкий перевод требует отдельно сохранённого active key и явного подтверждения.</p>' +
            '<label class="checkbox-label"><input id="magic-burn-consent" type="checkbox" required> Я понимаю, что сжигание VIZ необратимо</label>' +
            '<button class="btn btn-primary" type="submit"' + (VizAccount.hasActiveKey() && !pendingMint ? '' : ' disabled aria-disabled="true"') + '>Перевести VIZ и получить MAGIC</button></form>' +
            (VizAccount.hasActiveKey() ? '' : '<p role="status">Active key не подключён. Кошелёк не запрашивает и не сохраняет его автоматически.</p>') +
            '</details></section>' +
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

    function _pendingMint(history, user) {
        var pending = null;
        var storageKey = PENDING_MINT_KEY + user;
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
        var fixedForm = Helpers.$('magic-mint-fixed-form');
        if (fixedForm) fixedForm.addEventListener('submit', function(event) {
            event.preventDefault();
            var amount = String(Helpers.$('magic-fixed-amount').value || '').trim();
            var milli = VTProtocol.parseAmount(amount);
            var maxEnergy = Number(Helpers.$('magic-fixed-energy').value);
            if (milli === null || !Number.isInteger(maxEnergy) || maxEnergy <= 0 || maxEnergy > 10000 || !Helpers.$('magic-fixed-consent').checked) {
                Toast.show('Укажите точную положительную сумму, лимит энергии 1–10000 и подтвердите необратимость.', 'error');
                return;
            }
            var canonical = VTProtocol.formatAmount(milli);
            Modal.show({ title: 'Направить VIZ аккаунту null?', text: 'Fixed award: ' + canonical + ' VIZ. Выпуск после необратимого подтверждения: ' + canonical + ' MAGIC. Максимум энергии: ' + maxEnergy + '. Подпись regular key.', buttons: [
                { text: 'Подтвердить ' + canonical + ' VIZ', className: 'btn-danger', action: function() {
                    var intent = _id('mint-fixed');
                    localStorage.setItem(PENDING_MINT_KEY + user, JSON.stringify({ intent: intent, amount: canonical, account: user, method: 'fixed_award', maxEnergy: maxEnergy }));
                    VizBroadcast.mintMagicFixedAward(intent, canonical, maxEnergy, function(err) {
                        Toast.show(err ? 'Статус операции неизвестен. Не повторяйте её до проверки истории: ' + (err.message || err) : 'Операция отправлена. MAGIC появится после необратимого подтверждения.', err ? 'error' : 'success');
                        render();
                    });
                } }
            ] });
        });

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
                    localStorage.setItem(PENDING_MINT_KEY + user, JSON.stringify({ intent: intent, amount: canonical, account: user, method: 'transfer' }));
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
