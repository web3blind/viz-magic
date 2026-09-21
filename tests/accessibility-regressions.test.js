const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function test(name, fn) {
  try {
    fn();
    console.log('PASS ' + name);
  } catch (err) {
    console.error('FAIL ' + name + ': ' + err.message);
    process.exitCode = 1;
  }
}

const manifest = JSON.parse(read('app/manifest.json'));
const indexHtml = read('app/index.html');
const appJs = read('app/js/ui/app.js');
const a11yJs = read('app/js/utils/a11y.js');
const modalJs = read('app/js/ui/components/modal.js');
const navJs = read('app/js/ui/components/nav.js');
const huntJs = read('app/js/ui/screens/hunt.js');
const onboardingJs = read('app/js/ui/screens/onboarding.js');
const settingsJs = read('app/js/ui/screens/settings.js');
const accessibilityCss = read('app/css/accessibility.css');
const mainCss = read('app/css/main.css');
const helpersJs = read('app/js/utils/helpers.js');
const characterJs = read('app/js/ui/screens/character.js');
const inventoryJs = read('app/js/ui/screens/inventory.js');
const guildJs = read('app/js/ui/screens/guild.js');
const developersJs = read('app/js/ui/screens/developers.js');
const helpJs = read('app/js/ui/screens/help.js');

test('manifest does not lock orientation', function () {
  assert.ok(!Object.prototype.hasOwnProperty.call(manifest, 'orientation'), 'orientation lock should be removed');
});

test('app shell exposes skip link before main content', function () {
  assert.ok(indexHtml.includes('class="skip-link"'), 'skip link class missing');
  assert.ok(indexHtml.includes('href="#app-main"'), 'skip link target should point to #app-main');
  assert.ok(indexHtml.includes('id="app-main"'), 'app-main target missing');
});

test('screen navigation includes explicit focus handoff', function () {
  assert.ok(/_moveFocusToScreen\s*\(/.test(appJs), 'screen focus helper missing');
  assert.ok(/_moveFocusToScreen\(target, screenId\)/.test(appJs), 'navigateTo should move focus to active screen');
});

test('a11y helpers expose keyboard support for radio groups', function () {
  assert.ok(/function bindRadioGroup\(/.test(a11yJs), 'bindRadioGroup helper missing');
  assert.ok(/ArrowRight|ArrowDown|ArrowLeft|ArrowUp/.test(a11yJs), 'radio group helper should support arrow keys');
});

test('modal component applies dialog semantics and focus restoration', function () {
  assert.ok(/role', 'dialog'|role="dialog"/.test(modalJs), 'dialog role missing');
  assert.ok(/aria-modal/.test(modalJs), 'aria-modal missing');
  assert.ok(/lastFocusedElement|restoreFocus/.test(modalJs), 'focus restoration missing');
});

test('bottom navigation uses navigation semantics instead of fake tabs', function () {
  assert.ok(!/role="tab"/.test(navJs), 'nav should not expose tab role');
  assert.ok(/aria-current=/.test(navJs) || /aria-current"/.test(navJs), 'nav should expose aria-current for active destination');
});

test('hunt and onboarding screens use shared keyboard radio-group binding', function () {
  assert.ok(/A11y\.bindRadioGroup/.test(huntJs), 'hunt screen should use bindRadioGroup');
  assert.ok(/A11y\.bindRadioGroup/.test(onboardingJs), 'onboarding screen should use bindRadioGroup');
});

test('settings accessibility toggles map to persistent DOM hooks', function () {
  assert.ok(/setAttribute\('data-theme', 'high-contrast'\)|setAttribute\("data-theme", "high-contrast"\)/.test(settingsJs), 'high contrast should map to data-theme hook');
  assert.ok(/viz_magic_reduced_motion|STORAGE_PREFIX \+ 'reduced_motion'/.test(settingsJs), 'reduced motion preference should be persisted');
  assert.ok(/\.high-contrast|\[data-theme="high-contrast"\]/.test(accessibilityCss), 'high contrast CSS hook missing');
  assert.ok(/\.reduced-motion/.test(accessibilityCss), 'reduced motion class hook missing');
});

test('skip link styles are present', function () {
  assert.ok(/\.skip-link/.test(mainCss), 'skip-link CSS missing');
});

test('paid secret library uses labeled regions, buttons, live status, and focus handoff', function () {
  const help = read('app/js/ui/screens/help.js');
  const css = read('app/css/main.css');
  assert.ok(/help-secret-library[\s\S]*aria-labelledby="help-secret-library-title"/.test(help), 'secret library should be a labeled region');
  assert.ok(/id="help-secret-library-title" tabindex="-1"/.test(help), 'secret library heading should receive focus after unlock');
  assert.ok(/help-secret-library-status[\s\S]*role="status" aria-live="polite"/.test(help), 'unlock status should be announced politely');
  assert.ok(/type="button" class="btn btn-primary" id="help-secret-library-unlock"/.test(help), 'locked chapter entry should be a real button');
  assert.ok(/unlock\.addEventListener\('click', _unlockSecretLibrary\)/.test(help), 'the labeled room button should launch the single-step payment flow directly');
  assert.ok(/confirm\.setAttribute\('aria-busy', 'true'\)/.test(help) && /help_secret_library_waiting_confirmation/.test(help), 'the same button should expose busy state while payment proof is pending');
  assert.ok(/type="button" class="help-library-link help-secret-library-link"/.test(help), 'secret map entries should remain keyboard-operable buttons');
  assert.ok(/\.help-secret-library-link[\s\S]*min-height:\s*44px[\s\S]*white-space:\s*normal[\s\S]*overflow-wrap:\s*anywhere/.test(css), 'secret map buttons should have 44px touch targets and wrap without mobile overflow');
});

test('rapid paid chapter queue exposes the same polite status for every chapter', function () {
  const ru = read('app/js/i18n/ru.js');
  const en = read('app/js/i18n/en.js');
  const setters = [
    '_setSecretLibraryStatus',
    '_setUnknownLibraryStatus',
    '_setMiddleLibraryStatus',
    '_setAttractionLibraryStatus',
    '_setLivingNatureLibraryStatus',
    '_setLivingElementsLibraryStatus',
    '_setLivingForestLibraryStatus'
  ];
  setters.forEach(function (setter) {
    const pattern = new RegExp(setter + "\\(Helpers\\.t\\('help_library_payment_queued'\\)\\)");
    assert.ok(pattern.test(helpJs), setter + ' should announce that its payment request entered the queue');
  });
  assert.ok(/help_library_payment_queued:\s*'Запрос принят\./.test(ru), 'Russian queue status should reassure the user that the request was accepted');
  assert.ok(/help_library_payment_queued:\s*'Request accepted\./.test(en), 'English queue status should explain the same state');
  ['Secret', 'Unknown', 'Middle', 'Attraction', 'LivingNature', 'LivingElements', 'LivingForest'].forEach(function (chapter) {
    const unlockPattern = new RegExp('function _unlock' + chapter + "Library\\(\\)[\\s\\S]{0,1100}setAttribute\\('aria-disabled', 'true'\\)");
    const resetPattern = new RegExp('function _reset' + chapter + "LibraryAction\\(button\\)[\\s\\S]{0,500}removeAttribute\\('aria-disabled'\\)");
    assert.ok(unlockPattern.test(helpJs), chapter + ' payment control should expose aria-disabled while busy');
    assert.ok(resetPattern.test(helpJs), chapter + ' payment control should clear aria-disabled when restored');
  });
});

test('accepted paid chapter requests become persistent proof-only actions instead of payable buttons', function () {
  const chapters = ['chapter2', 'chapter3', 'chapter4', 'chapter5', 'chapter6', 'chapter7', 'chapter8'];
  assert.ok(/function _setLibraryPendingProof\(user, chapter, day, result\)/.test(helpJs), 'accepted broadcasts should persist an account/chapter/day proof marker');
  assert.ok(/function _getLibraryPendingProof\(user, chapter, day\)/.test(helpJs), 'render and activation should recover the persisted proof marker');
  assert.ok(/function _clearLibraryPendingProof\(user, chapter\)/.test(helpJs), 'verified access or definite pre-acceptance failure should clear the marker');
  assert.ok(/function _checkLibraryPendingProof\(/.test(helpJs), 'pending buttons should run proof-only recovery');
  assert.ok(/help_secret_library_check_access/.test(helpJs), 'pending controls should have a distinct proof-only label');
  chapters.forEach(function (chapter) {
    const setPattern = new RegExp("_setLibraryPendingProof\\(user, '" + chapter + "', day, result\\)");
    const getPattern = new RegExp("_getLibraryPendingProof\\(user, '" + chapter + "', day\\)");
    assert.ok(setPattern.test(helpJs), chapter + ' should persist pending proof immediately after broadcast acceptance');
    assert.ok(getPattern.test(helpJs), chapter + ' should recover pending proof before any new broadcast path');
  });
  assert.ok(!/if \(proofErr\) \{[\s\S]{0,120}_reset(?:Secret|Unknown|Middle|Attraction|LivingNature|LivingElements)LibraryAction/.test(helpJs), 'post-broadcast proof timeout must never restore a payable action');
  assert.ok(/aria-busy[\s\S]*help_secret_library_check_access/.test(helpJs), 'proof-only actions should remain keyboard and screen-reader distinguishable');
});

test('paid chapter preflights are serialized before the broadcast queue', function () {
  assert.ok(/var libraryPreflightQueue = \[\];/.test(helpJs), 'paid chapter checks should use one shared preflight queue');
  assert.ok(/function _enqueueLibraryPreflight\(task\)/.test(helpJs), 'paid chapter checks should expose a sequential queue helper');
  assert.ok(/function _preflightSecretLibraryEntitlement\(user, day, callback, chapter, attempt\) \{[\s\S]{0,180}_enqueueLibraryPreflight\(function\(release\)/.test(helpJs), 'public preflight should reserve one queue slot');
  assert.ok(/_runSecretLibraryPreflight\(user, day, function\(err, unlocked\) \{[\s\S]{0,120}release\(\)/.test(helpJs), 'the complete retry cycle should release its queue slot at completion');
});

test('Unknown Maps keeps persistent polite feedback throughout preflight and send failure', function () {
  assert.ok(/unknownLibraryBusy = true;[\s\S]{0,180}_setUnknownLibraryStatus\(Helpers\.t\('help_secret_library_checking'\)\)/.test(helpJs), 'Unknown Maps should announce preflight immediately');
  ['help_secret_library_history_check_failed', 'help_magic_library_chapter_three_energy_failed', 'help_magic_library_chapter_three_not_enough', 'help_library_payment_not_sent'].forEach(function(key) {
    assert.ok(new RegExp("_setUnknownLibraryStatus\\(Helpers\\.t\\('" + key + "'\\)\\)").test(helpJs), 'Unknown Maps should persist ' + key + ' in its live region');
  });
});

test('Creators book has ordered headings, labeled pages, and keyboard-safe external links', function () {
  assert.ok(/setAttribute\('aria-label', t\('developers_title'\)\)/.test(developersJs), 'creator route label should follow the selected language');
  assert.ok(/aria-labelledby="creators-book-title"/.test(developersJs), 'creator book should be named by its visible heading');
  assert.ok(/id="creators-book-title"/.test(developersJs), 'creator book title id should exist');
  assert.ok(/aria-labelledby="creators-denis-title"/.test(developersJs) && /aria-labelledby="creators-evgeny-title"/.test(developersJs), 'both creator pages should be labelled by headings');
  assert.ok(/titleId = 'creators-reward-' \+ creator\.id/.test(developersJs) && /class="creators-page-gratitude" aria-labelledby="' \+ titleId/.test(developersJs), 'each rendered gratitude seal should be a uniquely labelled subsection');
  assert.ok(/creators-custom-energy-' \+ creator\.id/.test(developersJs), 'creator reward inputs should have unique ids');
  assert.ok(/if \(!creator\.account\) return ''/.test(developersJs), 'creator without an account should expose no empty reward controls');
  assert.ok(/target="_blank" rel="noopener noreferrer"/.test(developersJs), 'external links should be isolated safely');
  assert.ok(/\.creators-link[\s\S]*min-height:\s*44px[\s\S]*overflow-wrap:\s*anywhere/.test(mainCss), 'creator links should meet touch size and wrapping requirements');
  assert.ok(/\.creators-link:focus-visible/.test(mainCss), 'creator links should expose a visible keyboard focus state');
});

test('Unknown Maps chapter and Fading Path are labelled without hiding the red warning', function () {
  assert.ok(/help-unknown-library[^>]*aria-labelledby="help-unknown-library-title"/.test(helpJs), 'chapter three article should be named by its visible heading');
  assert.ok(/id="help-unknown-library-title" tabindex="-1"/.test(helpJs), 'chapter heading should accept programmatic focus after unlock');
  assert.ok(/class="help-library-danger"/.test(helpJs) && !/help-library-danger[^>]*aria-hidden/.test(helpJs), 'danger warning should remain exposed to screen readers');
  assert.ok(/\.help-library-danger\s*\{[\s\S]*color:\s*#ff6159\s*!important/.test(mainCss), 'danger warning should have an explicit red color');
  assert.ok(/<hr class="help-unknown-library-divider">[\s\S]*id="help-unknown-library-fading-title"[\s\S]*role="group" aria-labelledby="help-unknown-library-fading-title"/.test(helpJs), 'Fading Path should be separated and label its final button group');
  assert.ok(/\.help-secret-library-link[\s\S]*min-height:\s*44px/.test(mainCss), 'unknown map links should inherit 44px touch targets');
});

test('Living Nature paid chapter is labelled, keyboard-safe, and announces unlock state', function () {
  assert.ok(/help-living-nature-library[^>]*aria-labelledby="help-living-nature-library-title"/.test(helpJs), 'Living Nature chapter should be a labelled article');
  assert.ok(/id="help-living-nature-library-title" tabindex="-1"/.test(helpJs), 'Living Nature heading should accept focus after unlock');
  assert.ok(/help-living-nature-library-status[\s\S]*role="status" aria-live="polite"/.test(helpJs), 'Living Nature unlock status should be announced');
  assert.ok(/type="button" class="btn btn-primary" id="help-living-nature-library-unlock"/.test(helpJs), 'locked Living Nature chapter should use a real button');
  assert.ok(/livingNatureBusyAttrs[\s\S]*disabled aria-disabled="true" aria-busy="true"/.test(helpJs), 'Living Nature payment button should retain busy semantics across rerenders');
  assert.ok(/type="button" class="help-library-link help-secret-library-link help-living-nature-library-link"/.test(helpJs), 'Living Nature map entries should be keyboard-operable buttons');
  assert.ok(/id="help-living-nature-library-boundary-title"[\s\S]*role="group" aria-labelledby="help-living-nature-library-boundary-title"/.test(helpJs), 'Magical Boundary should label the second map group for screen readers');
  assert.ok(/_finishSecretLibraryOpen\('help_magic_library_living_nature_success', 'help-living-nature-library-title'\)/.test(helpJs), 'focus should return to the Living Nature heading after unlock');
  assert.ok(/var zoomBtn = Helpers\.\$\('help-library-zoom-toggle'\)[\s\S]*zoomBtn\.focus\(\)/.test(helpJs), 'an opened library dialog should move keyboard focus to its Zoom button');
  assert.ok(/@media \(max-width: 680px\)[\s\S]*modal:not\(\.help-library-fullscreen\) \.help-library-map-viewport[\s\S]*max-height:\s*42vh[\s\S]*modal:not\(\.help-library-fullscreen\) \.help-library-map-image[\s\S]*object-fit:\s*contain/.test(mainCss), 'mobile library dialog should show the complete map preview while keeping actions reachable');
});

test('Living Elements paid chapter is numbered, labelled, keyboard-safe, and announces unlock state', function () {
  assert.ok(/help-living-elements-library[^>]*aria-labelledby="help-living-elements-library-title"/.test(helpJs), 'Living Elements chapter should be a labelled article');
  assert.ok(/id="help-living-elements-library-title" tabindex="-1"/.test(helpJs), 'Living Elements heading should accept focus after unlock');
  assert.ok(/help-living-elements-library-status[\s\S]*role="status" aria-live="polite"/.test(helpJs), 'Living Elements unlock status should be announced');
  assert.ok(/type="button" class="btn btn-primary" id="help-living-elements-library-unlock"/.test(helpJs), 'locked Living Elements chapter should use a real button');
  assert.ok(/livingElementsBusyAttrs[\s\S]*disabled aria-disabled="true" aria-busy="true"/.test(helpJs), 'Living Elements payment button should retain busy semantics across rerenders');
  assert.ok(/type="button" class="help-library-link help-secret-library-link help-living-elements-library-link"/.test(helpJs), 'Living Elements map entries should be keyboard-operable buttons');
  assert.ok(/id="help-living-elements-library-awakening-title"[\s\S]*role="group" aria-labelledby="help-living-elements-library-awakening-title"/.test(helpJs), 'Awakening should label the second map group for screen readers');
  assert.ok(/_finishSecretLibraryOpen\('help_magic_library_living_elements_success', 'help-living-elements-library-title'\)/.test(helpJs), 'focus should return to the Living Elements heading after unlock');
  assert.ok(/Helpers\.escapeHtml\(entry\.number \+ '\. ' \+ t\(entry\.titleKey\)\)/.test(helpJs), 'visible map numbering and title should be included in each button accessible name');
});

test('Living Forest paid chapter is labelled, keyboard-safe, and announces unlock state', function () {
  assert.ok(/help-living-forest-library[^>]*aria-labelledby="help-living-forest-library-title"/.test(helpJs), 'Living Forest chapter should be a labelled article');
  assert.ok(/id="help-living-forest-library-title" tabindex="-1"/.test(helpJs), 'Living Forest heading should accept focus after unlock');
  assert.ok(/help-living-forest-library-status[\s\S]*role="status" aria-live="polite"/.test(helpJs), 'Living Forest unlock status should be announced');
  assert.ok(/type="button" class="btn btn-primary" id="help-living-forest-library-unlock"/.test(helpJs), 'locked Living Forest chapter should use a real button');
  assert.ok(/livingForestBusyAttrs[\s\S]*disabled aria-disabled="true" aria-busy="true"/.test(helpJs), 'Living Forest payment button should retain busy semantics across rerenders');
  assert.ok(/type="button" class="help-library-link help-secret-library-link help-living-forest-library-link"/.test(helpJs), 'Living Forest map entries should be keyboard-operable buttons');
  assert.ok(/_finishSecretLibraryOpen\('help_magic_library_living_forest_success', 'help-living-forest-library-title'\)/.test(helpJs), 'focus should return to the Living Forest heading after unlock');
});

test('core screen fallbacks avoid blank controls and fixture crashes', function () {
  assert.ok(/typeof num === 'undefined'/.test(helpersJs), 'formatNumber should tolerate missing numeric values');
  assert.ok(/ch\.coreBonus = ch\.coreBonus \|\| 0/.test(characterJs), 'character screen should default missing coreBonus');
  assert.ok(/ch\.spells = ch\.spells \|\| \[\]/.test(characterJs), 'character screen should default missing spells');
  assert.ok(/id="inv-compact"[\s\S]*aria-label=/.test(inventoryJs), 'inventory compact switch needs an accessible name');
  assert.ok(/id="input-active-key"[\s\S]*aria-label=/.test(guildJs), 'guild active key input needs an accessible name for TalkBack');
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
