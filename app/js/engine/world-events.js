/**
 * Viz Magic — World Events System
 * Calendar seasons, daily Moscow-time forecast text, Weave Surges, Minor Rifts, World Boss spawns.
 * Daily text blocks rotate at 00:00 Moscow time; chain events remain block-scheduled.
 */
var WorldEvents = (function() {
    'use strict';

    var cfg = VizMagicConfig;

    /** Block intervals */
    var SURGE_INTERVAL    = 864000;   // ~30 days
    var RIFT_INTERVAL     = 100000;   // ~3.5 days
    var BOSS_INTERVAL     = 864000;   // ~30 days (offset from surge)
    var BOSS_OFFSET       = 432000;   // half-interval offset
    var SURGE_DURATION    = 28800;    // ~1 day
    var RIFT_DURATION     = 14400;    // ~12 hours
    var BOSS_WINDOW       = 28800;    // ~1 day



    /** Daily text blocks rotate at Moscow midnight (UTC+3). */
    function _getMoscowDate(nowMs) {
        var d = new Date(typeof nowMs === 'number' ? nowMs : Date.now());
        // Moscow is UTC+3 without DST. Shift timestamp, then read UTC fields.
        return new Date(d.getTime() + 3 * 60 * 60 * 1000);
    }

    function _getMoscowDayIndex(nowMs) {
        var d = _getMoscowDate(nowMs);
        return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
    }

    function _getMoscowSeasonIndex(nowMs) {
        var d = _getMoscowDate(nowMs);
        var m = d.getUTCMonth();
        if (m >= 2 && m <= 4) return 0;  // March–May
        if (m >= 5 && m <= 7) return 1;  // June–August
        if (m >= 8 && m <= 10) return 2; // September–November
        return 3;                         // December–February
    }

    /** Season definitions */
    var SEASONS = [
        {
            id: 'spring',
            nameKey: 'season_spring',
            icon: '\uD83C\uDF31',
            dominant: 'aqua',
            secondary: 'terra',
            dominantBonus: 200,   // +20% (x1000)
            secondaryBonus: 100   // +10%
        },
        {
            id: 'summer',
            nameKey: 'season_summer',
            icon: '\u2600\uFE0F',
            dominant: 'ignis',
            secondary: 'ventus',
            dominantBonus: 200,
            secondaryBonus: 100
        },
        {
            id: 'autumn',
            nameKey: 'season_autumn',
            icon: '\uD83C\uDF42',
            dominant: 'umbra',
            secondary: 'ignis',
            dominantBonus: 200,
            secondaryBonus: 100
        },
        {
            id: 'winter',
            nameKey: 'season_winter',
            icon: '\u2744\uFE0F',
            dominant: 'terra',
            secondary: 'aqua',
            dominantBonus: 200,
            secondaryBonus: 100
        }
    ];


    /** Daily magical news: flavor-only, deterministic from block-day. */
    var MAGIC_NEWS = [
        { icon: '📰', summaryKey: 'magic_news_sun_wolf' },
        { icon: '🌲', summaryKey: 'magic_news_forest_patrol' },
        { icon: '🪄', summaryKey: 'magic_news_wand_union' },
        { icon: '🐸', summaryKey: 'magic_news_frog_court' },
        { icon: '🐉', summaryKey: 'magic_news_dragon_shadow' },
        { icon: '🕯️', summaryKey: 'magic_news_temple_candles' },
        { icon: '🏪', summaryKey: 'magic_news_bazaar_prices' },
        { icon: '📜', summaryKey: 'magic_news_chronicle_blots' },
        { icon: '🪖', summaryKey: 'magic_news_arena_helmets' },
        { icon: '🔮', summaryKey: 'magic_news_prophet_sneeze' },
        { icon: '🌧️', summaryKey: 'magic_news_upward_rain' },
        { icon: '🧪', summaryKey: 'magic_news_healers_busy' },
        { icon: '✨', summaryKey: 'magic_news_dead_wasteland' },
        { icon: '⚒️', summaryKey: 'magic_news_living_anvil' },
        { icon: '🧮', summaryKey: 'magic_news_school_math' },
        { icon: '🤫', summaryKey: 'magic_news_secret_knowledge' },
        { icon: '🧹', summaryKey: 'magic_news_broom_inspection' },
        { icon: '🐭', summaryKey: 'magic_news_royal_mouse' },
        { icon: '🧦', summaryKey: 'magic_news_sock_portal' },
        { icon: '🔍', summaryKey: 'magic_news_mirror_union' }
    ];

    /** Magical weather definitions. These are in-world, not real-world forecasts. */
    var WEATHER = [
        {
            id: 'frog_rain',
            icon: '\uD83D\uDC38',
            summaryKey: 'weather_frog_rain',
            effectKey: 'weather_frog_rain_effect',
            creatureAttackMod: 1050,
            playerDefenseMod: 1000
        },
        {
            id: 'low_dragons',
            icon: '\uD83D\uDC32',
            summaryKey: 'weather_low_dragons',
            effectKey: 'weather_low_dragons_effect',
            creatureAttackMod: 1100,
            playerDefenseMod: 1000
        },
        {
            id: 'singing_lightning',
            icon: '\u26A1',
            summaryKey: 'weather_singing_lightning',
            effectKey: 'weather_singing_lightning_effect',
            creatureAttackMod: 1000,
            playerDefenseMod: 950
        },
        {
            id: 'quiet_stars',
            icon: '\uD83D\uDD6F\uFE0F',
            summaryKey: 'weather_quiet_stars',
            effectKey: 'weather_quiet_stars_effect',
            creatureAttackMod: 950,
            playerDefenseMod: 1050
        },
        {
            id: 'forbidden_wind',
            icon: '\uD83E\uDE81',
            summaryKey: 'weather_forbidden_wind',
            effectKey: 'weather_forbidden_wind_effect',
            creatureAttackMod: 1150,
            playerDefenseMod: 950
        },
        {
            id: 'dragon_shadow',
            icon: '\uD83D\uDC09',
            summaryKey: 'weather_dragon_shadow',
            effectKey: 'weather_dragon_shadow_effect',
            creatureAttackMod: 1120,
            playerDefenseMod: 1000
        },
        {
            id: 'no_looking_back',
            icon: '\uD83D\uDC41\uFE0F',
            summaryKey: 'weather_no_looking_back',
            effectKey: 'weather_no_looking_back_effect',
            creatureAttackMod: 1080,
            playerDefenseMod: 980
        },
        {
            id: 'mirror_fog',
            icon: '\uD83E\uDE9E',
            summaryKey: 'weather_mirror_fog',
            effectKey: 'weather_mirror_fog_effect',
            creatureAttackMod: 1000,
            playerDefenseMod: 920
        },
        {
            id: 'whispering_mushrooms',
            icon: '\uD83C\uDF44',
            summaryKey: 'weather_whispering_mushrooms',
            effectKey: 'weather_whispering_mushrooms_effect',
            creatureAttackMod: 960,
            playerDefenseMod: 1060
        },
        {
            id: 'iron_moon',
            icon: '\uD83C\uDF15',
            summaryKey: 'weather_iron_moon',
            effectKey: 'weather_iron_moon_effect',
            creatureAttackMod: 1030,
            playerDefenseMod: 1030
        },
        {
            id: 'singing_swamp',
            icon: '\uD83E\uDEB7',
            summaryKey: 'weather_singing_swamp',
            effectKey: 'weather_singing_swamp_effect',
            creatureAttackMod: 1060,
            playerDefenseMod: 960
        },
        {
            id: 'upward_rain',
            icon: '\uD83C\uDF27\uFE0F',
            summaryKey: 'weather_upward_rain',
            effectKey: 'weather_upward_rain_effect',
            creatureAttackMod: 970,
            playerDefenseMod: 1040
        },
        {
            id: 'glass_grass',
            icon: '\uD83C\uDF3F',
            summaryKey: 'weather_glass_grass',
            effectKey: 'weather_glass_grass_effect',
            creatureAttackMod: 1090,
            playerDefenseMod: 970
        },
        {
            id: 'sleeping_thunder',
            icon: '\uD83C\uDF29\uFE0F',
            summaryKey: 'weather_sleeping_thunder',
            effectKey: 'weather_sleeping_thunder_effect',
            creatureAttackMod: 940,
            playerDefenseMod: 1080
        },
        {
            id: 'hungry_constellations',
            icon: '\uD83C\uDF0C',
            summaryKey: 'weather_hungry_constellations',
            effectKey: 'weather_hungry_constellations_effect',
            creatureAttackMod: 1110,
            playerDefenseMod: 1000
        },
        {
            id: 'borrowed_sun',
            icon: '\uD83D\uDD2E',
            summaryKey: 'weather_borrowed_sun',
            effectKey: 'weather_borrowed_sun_effect',
            creatureAttackMod: 980,
            playerDefenseMod: 1070
        },
        {
            id: 'ash_snow',
            icon: '\uD83D\uDD25',
            summaryKey: 'weather_ash_snow',
            effectKey: 'weather_ash_snow_effect',
            creatureAttackMod: 1040,
            playerDefenseMod: 990
        },
        {
            id: 'lost_names',
            icon: '\uD83D\uDCDC',
            summaryKey: 'weather_lost_names',
            effectKey: 'weather_lost_names_effect',
            creatureAttackMod: 1070,
            playerDefenseMod: 970
        },
        {
            id: 'clockwork_hail',
            icon: '\u23F1\uFE0F',
            summaryKey: 'weather_clockwork_hail',
            effectKey: 'weather_clockwork_hail_effect',
            creatureAttackMod: 1130,
            playerDefenseMod: 980
        },
        {
            id: 'polite_crows',
            icon: '\uD83D\uDC26\u200D\u2B1B',
            summaryKey: 'weather_polite_crows',
            effectKey: 'weather_polite_crows_effect',
            creatureAttackMod: 960,
            playerDefenseMod: 1060
        },
        {
            id: 'golden_dust',
            icon: '\uD83D\uDCB0',
            summaryKey: 'weather_golden_dust',
            effectKey: 'weather_golden_dust_effect',
            creatureAttackMod: 930,
            playerDefenseMod: 1100
        },
        {
            id: 'black_rainbow',
            icon: '\uD83D\uDDA4',
            summaryKey: 'weather_black_rainbow',
            effectKey: 'weather_black_rainbow_effect',
            creatureAttackMod: 1100,
            playerDefenseMod: 940
        },
        {
            id: 'wandering_doors',
            icon: '\uD83D\uDEAA',
            summaryKey: 'weather_wandering_doors',
            effectKey: 'weather_wandering_doors_effect',
            creatureAttackMod: 1050,
            playerDefenseMod: 970
        },
        {
            id: 'salt_wind',
            icon: '\uD83C\uDF2C\uFE0F',
            summaryKey: 'weather_salt_wind',
            effectKey: 'weather_salt_wind_effect',
            creatureAttackMod: 1020,
            playerDefenseMod: 1020
        },
        {
            id: 'paper_storm',
            icon: '\uD83D\uDCDC',
            summaryKey: 'weather_paper_storm',
            effectKey: 'weather_paper_storm_effect',
            creatureAttackMod: 1080,
            playerDefenseMod: 960
        },
        {
            id: 'bone_bells',
            icon: '\uD83D\uDD14',
            summaryKey: 'weather_bone_bells',
            effectKey: 'weather_bone_bells_effect',
            creatureAttackMod: 1140,
            playerDefenseMod: 950
        },
        {
            id: 'kind_darkness',
            icon: '\uD83C\uDF11',
            summaryKey: 'weather_kind_darkness',
            effectKey: 'weather_kind_darkness_effect',
            creatureAttackMod: 920,
            playerDefenseMod: 1120
        },
        {
            id: 'blue_fireflies',
            icon: '\uD83D\uDCA1',
            summaryKey: 'weather_blue_fireflies',
            effectKey: 'weather_blue_fireflies_effect',
            creatureAttackMod: 950,
            playerDefenseMod: 1080
        },
        {
            id: 'wrong_echo',
            icon: '\uD83D\uDD0A',
            summaryKey: 'weather_wrong_echo',
            effectKey: 'weather_wrong_echo_effect',
            creatureAttackMod: 1090,
            playerDefenseMod: 970
        },
        {
            id: 'crown_of_rain',
            icon: '\uD83D\uDC51',
            summaryKey: 'weather_crown_of_rain',
            effectKey: 'weather_crown_of_rain_effect',
            creatureAttackMod: 1050,
            playerDefenseMod: 1050
        }
    ];





    /** Calendar magical holidays tied to game sections. Month is 1-12, day is 1-31 (Moscow time). */
    var GREAT_FESTIVALS = [
        { id: 'hearth_spirit_day', month: 1, day: 7, type: 'great', icon: '\uD83C\uDFE0', screen: 'home', nameKey: 'festival_hearth_spirit_day', descKey: 'festival_hearth_spirit_day_desc' },
        { id: 'chronicle_ink_night', month: 2, day: 14, type: 'great', icon: '\uD83D\uDCDD', screen: 'chronicle', nameKey: 'festival_chronicle_ink_night', descKey: 'festival_chronicle_ink_night_desc' },
        { id: 'wind_dance', month: 3, day: 21, type: 'great', icon: '\uD83C\uDF00', screen: 'map', nameKey: 'festival_wind_dance', descKey: 'festival_wind_dance_desc' },
        { id: 'bazaar_bell_day', month: 4, day: 12, type: 'great', icon: '\uD83C\uDFEA', screen: 'marketplace', nameKey: 'festival_bazaar_bell_day', descKey: 'festival_bazaar_bell_day_desc' },
        { id: 'victory_day', month: 5, day: 9, type: 'great', icon: '\uD83C\uDFC6', screen: 'guild', nameKey: 'festival_victory_day', descKey: 'festival_victory_day_desc' },
        { id: 'hunt_tribute', month: 6, day: 21, type: 'great', icon: '\uD83C\uDFF9', screen: 'hunt', nameKey: 'festival_hunt_tribute', descKey: 'festival_hunt_tribute_desc' },
        { id: 'hammer_sparks', month: 7, day: 17, type: 'great', icon: '\uD83D\uDD28', screen: 'crafting', nameKey: 'festival_hammer_sparks', descKey: 'festival_hammer_sparks_desc' },
        { id: 'bag_whisper', month: 8, day: 8, type: 'great', icon: '\uD83C\uDF92', screen: 'inventory', nameKey: 'festival_bag_whisper', descKey: 'festival_bag_whisper_desc' },
        { id: 'secret_knowledge_day', month: 9, day: 1, type: 'great', icon: '\uD83D\uDD2E', screen: 'quests', nameKey: 'festival_secret_knowledge_day', descKey: 'festival_secret_knowledge_day_desc' },
        { id: 'dragon_mask_day', month: 10, day: 31, type: 'great', icon: '\uD83D\uDC32', screen: 'world-boss', nameKey: 'festival_dragon_mask_day', descKey: 'festival_dragon_mask_day_desc' },
        { id: 'first_spark_tournament', month: 11, day: 11, type: 'great', icon: '\u2694\uFE0F', screen: 'arena', nameKey: 'festival_first_spark_tournament', descKey: 'festival_first_spark_tournament_desc' },
        { id: 'great_year_weave', month: 12, day: 31, type: 'great', icon: '\uD83C\uDF86', screen: 'chronicle', nameKey: 'festival_great_year_weave', descKey: 'festival_great_year_weave_desc' }
    ];

    var MINOR_FESTIVALS = [
        { id: 'ink_drop_day', month: 2, day: 3, type: 'minor', icon: '\uD83D\uDD8B\uFE0F', screen: 'chronicle', nameKey: 'festival_ink_drop_day', descKey: 'festival_ink_drop_day_desc' },
        { id: 'quiet_anvil', month: 4, day: 23, type: 'minor', icon: '\u2692\uFE0F', screen: 'crafting', nameKey: 'festival_quiet_anvil', descKey: 'festival_quiet_anvil_desc' },
        { id: 'map_knot_day', month: 6, day: 3, type: 'minor', icon: '\uD83D\uDDFA\uFE0F', screen: 'map', nameKey: 'festival_map_knot_day', descKey: 'festival_map_knot_day_desc' },
        { id: 'temple_steps_day', month: 9, day: 23, type: 'minor', icon: '\uD83D\uDD6F\uFE0F', screen: 'temple', nameKey: 'festival_temple_steps_day', descKey: 'festival_temple_steps_day_desc' },
        { id: 'winter_bag_check', month: 12, day: 13, type: 'minor', icon: '\uD83C\uDF92', screen: 'inventory', nameKey: 'festival_winter_bag_check', descKey: 'festival_winter_bag_check_desc' }
    ];

    var DAILY_FESTIVALS = [
        { icon: '🎨', nameKey: 'festival_daily_sky_painting', descKey: 'festival_daily_sky_painting_desc' },
        { icon: '🤫', nameKey: 'festival_daily_secret_silence', descKey: 'festival_daily_secret_silence_desc' },
        { icon: '☕', nameKey: 'festival_daily_teacup_oracle', descKey: 'festival_daily_teacup_oracle_desc' },
        { icon: '🧦', nameKey: 'festival_daily_sock_portal', descKey: 'festival_daily_sock_portal_desc' },
        { icon: '🧹', nameKey: 'festival_daily_broom_parade', descKey: 'festival_daily_broom_parade_desc' },
        { icon: '🐭', nameKey: 'festival_daily_royal_mouse', descKey: 'festival_daily_royal_mouse_desc' },
        { icon: '🔍', nameKey: 'festival_daily_polite_mirrors', descKey: 'festival_daily_polite_mirrors_desc' },
        { icon: '🔔', nameKey: 'festival_daily_bell_rehearsal', descKey: 'festival_daily_bell_rehearsal_desc' },
        { icon: '🥨', nameKey: 'festival_daily_knotty_bread', descKey: 'festival_daily_knotty_bread_desc' },
        { icon: '🪄', nameKey: 'festival_daily_wand_nap', descKey: 'festival_daily_wand_nap_desc' },
        { icon: '🧀', nameKey: 'festival_daily_moon_cheese', descKey: 'festival_daily_moon_cheese_desc' },
        { icon: '📦', nameKey: 'festival_daily_box_of_maybes', descKey: 'festival_daily_box_of_maybes_desc' },
        { icon: '🪁', nameKey: 'festival_daily_kite_prophecy', descKey: 'festival_daily_kite_prophecy_desc' }
    ];

    /** Everyday magical sky signs. Combined with omens, this gives a year-sized forecast pool. */
    var SKY_SIGNS = [
        { id: 'sun_cloud', icon: '\u26C5', summaryKey: 'sky_sun_cloud' },
        { id: 'rain', icon: '\uD83C\uDF27\uFE0F', summaryKey: 'sky_rain' },
        { id: 'hail', icon: '\uD83C\uDF28\uFE0F', summaryKey: 'sky_hail' },
        { id: 'lightning', icon: '\uD83C\uDF29\uFE0F', summaryKey: 'sky_lightning' },
        { id: 'hurricane', icon: '\uD83C\uDF2A\uFE0F', summaryKey: 'sky_hurricane' },
        { id: 'dry_heat', icon: '\uD83C\uDF35', summaryKey: 'sky_dry_heat' },
        { id: 'hard_frost', icon: '\u2744\uFE0F', summaryKey: 'sky_hard_frost' },
        { id: 'dust_storm', icon: '\uD83C\uDF2B\uFE0F', summaryKey: 'sky_dust_storm' },
        { id: 'sudden_thaw', icon: '\uD83E\uDDCA', summaryKey: 'sky_sudden_thaw' },
        { id: 'red_dawn', icon: '\uD83C\uDF05', summaryKey: 'sky_red_dawn' },
        { id: 'black_snow', icon: '\u26C4', summaryKey: 'sky_black_snow' },
        { id: 'silver_fog', icon: '\uD83C\uDF01', summaryKey: 'sky_silver_fog' },
        { id: 'double_rainbow', icon: '\uD83C\uDF08', summaryKey: 'sky_double_rainbow' }
    ];



    var SKY_TWISTS = [
        'В лужах дрожат чужие созвездия, но дорога остаётся своей.',
        'Облака идут строем, будто несут приказ старого архимага.',
        'Ветер собирает пыль в руны и тут же делает вид, что ничего не было.',
        'У крыш сегодня серебряные края; домовые считают это хорошим знаком.',
        'Дождь шепчет по стеклу короткие советы, половина из них полезна.',
        'Тени стали длиннее обычного и внимательно слушают шаги.',
        'На востоке висит тонкая полоса света, как закладка в книге мира.',
        'Город пахнет мокрым камнем и ещё не открытыми порталами.',
        'Небо будто проверяет чернила: каждая туча оставляет свою подпись.',
        'Солнце выходит осторожно, как кот к незнакомому заклинанию.',
        'По краям облаков пробегают искры, но гром пока держит паузу.',
        'Утренний воздух звенит так тихо, что его слышат только внимательные маги.',
        'Над дальними башнями кружит свет, похожий на потерянную мысль.',
        'Снег, дождь и пыль спорят без победителя; мир зато не скучает.',
        'В небе заметна трещина цвета мёда; к вечеру она обещает закрыться.',
        'Птицы летят слишком ровно, будто кто-то нарисовал маршрут линейкой.',
        'Туман держится у земли и делает вид, что он просто ковёр.',
        'Каждая капля сегодня падает с чувством собственного достоинства.',
        'На крышах собирается светлая изморозь, похожая на россыпь маленьких печатей.',
        'Ветер несёт запах костра, хотя ближайший костёр ещё не придуман.',
        'Небо гасит лишний шум и оставляет только важные шорохи.',
        'За облаками ворчит Эфирный Дракон, но пока без официального заявления.',
        'Дальние молнии тренируются без публики.',
        'Воздух стал чуть гуще: слова в нём держатся дольше обычного.',
        'Радуга появилась не там, где её ждали, и этим всё сказала.',
        'Северный край неба подсвечен так, будто мир получил новое уведомление.',
        'На горизонте плывёт туча в форме неудачного пророчества.',
        'Дымки над дорогами складываются в карту, но карта никому не доверяет.',
        'Вечерний свет ложится ровно, как свежая страница Хроники.',
        'Небо сегодня без повторов: даже старые тучи пришли в новых плащах.',
        'Луна оставила дневную подпись, чтобы ночь не потеряла очередь.'
    ];

    var FESTIVAL_TWISTS = [
        'у дверей оставляют тёплое слово, а дома отвечают скрипом половиц.',
        'охотники благодарят следы, даже если следы явно хитрят.',
        'щиты гильдий чистят до блеска, чтобы храбрость видела своё отражение.',
        'писцы ставят кляксы намеренно: так Хроника понимает, что запись живая.',
        'базарные колокольчики спорят с монетами о честной цене.',
        'молотки мастерской сегодня стучат в ритме маленького парада.',
        'сумки шепчут владельцам, что лишних вещей не бывает, бывают маленькие карманы.',
        'свечи пророчества горят ровно, но тень от них всё равно рассказывает своё.',
        'маски дракона примеряют даже те, кто уверяет, что совсем не боится.',
        'маги обмениваются короткими благословениями и длинными подозрениями.',
        'карты разворачивают сами себя, если попросить достаточно вежливо.',
        'арена гремит пустыми трибунами, тренируясь к настоящему шуму.',
        'храмовые ступени помнят каждое подношение и почти никого не осуждают.',
        'старые рецепты притворяются новыми, пока рядом не проходит опытный мастер.',
        'рейтинги сегодня ведут себя скромно, но всё равно хотят внимания.',
        'путники завязывают узелки на память, а узелки запоминают лишнее.',
        'домовой проверяет очаги и делает вид, что это не инспекция.',
        'гильдейские знамена хлопают так, будто аплодируют будущим победам.',
        'чернильницы раскрываются раньше пера: им тоже хочется праздника.',
        'ветер приносит слухи с Базара, аккуратно завёрнутые в бумагу.',
        'мастерская выпускает искры строго по расписанию, но расписание тайное.',
        'охотничьи тропы сегодня мягче обычного, словно тоже празднуют.',
        'дуэльные шпили считают облака и делают ставки без свидетелей.',
        'персонажи получают право на лишнюю легенду о себе.',
        'настройки мира ненадолго становятся добрее к забывчивым магам.',
        'разработчики получают невидимый пирог и очень видимую благодарность.',
        'карта подмигивает новым маршрутам, но не всем сразу.',
        'Базар открывает витрины так широко, будто ждёт королевскую мышь.',
        'Хроника ставит свежую закладку и требует красивой истории.',
        'мана в воздухе звенит чаще: это знак плетения, а не бухгалтерская ошибка.',
        'небо обещает новый странный текст завтра и держит слово.'
    ];

    /**
     * Get the current real-world calendar season in Moscow time.
     * @param {number} blockNum kept for API compatibility
     * @returns {Object} season definition
     */
    function getCurrentSeason(blockNum) {
        var seasonIndex = _getMoscowSeasonIndex();
        return SEASONS[seasonIndex];
    }

    /**
     * Approximate blocks until the next real calendar season in Moscow time.
     * @param {number} blockNum kept for API compatibility
     * @returns {number}
     */
    function blocksUntilSeasonChange(blockNum) {
        var d = _getMoscowDate();
        var y = d.getUTCFullYear();
        var m = d.getUTCMonth();
        var nextMonth = (m < 2) ? 2 : (m < 5 ? 5 : (m < 8 ? 8 : (m < 11 ? 11 : 14)));
        var nextYear = y + Math.floor(nextMonth / 12);
        nextMonth = nextMonth % 12;
        var nextUtc = Date.UTC(nextYear, nextMonth, 1) - 3 * 60 * 60 * 1000;
        var ms = Math.max(0, nextUtc - Date.now());
        return Math.ceil(ms / 3000);
    }

    /**
     * Get elemental bonuses from current season.
     * @param {number} blockNum
     * @returns {Object} map of school → bonus (x1000 additive)
     */
    function getSeasonalBonuses(blockNum) {
        var season = getCurrentSeason(blockNum);
        var bonuses = {};
        bonuses[season.dominant] = season.dominantBonus;
        bonuses[season.secondary] = season.secondaryBonus;
        return bonuses;
    }







    function _findFestivalForDate(list, month, day) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].month === month && list[i].day === day) return list[i];
        }
        return null;
    }

    /**
     * Get today's magical holiday from the authored Moscow calendar.
     * Most days intentionally have no festival, so holidays feel like events.
     * @param {number} blockNum kept for API compatibility
     * @param {number=} nowMs optional timestamp for deterministic tests
     * @returns {Object|null}
     */
    function getCurrentFestival(blockNum, nowMs) {
        var d = _getMoscowDate(nowMs);
        var month = d.getUTCMonth() + 1;
        var day = d.getUTCDate();
        var festival = _findFestivalForDate(GREAT_FESTIVALS, month, day) || _findFestivalForDate(MINOR_FESTIVALS, month, day);
        if (!festival) festival = _getGeneratedDailyFestival(_getMoscowDayIndex(nowMs));
        var out = {};
        for (var key in festival) if (festival.hasOwnProperty(key)) out[key] = festival[key];
        out.prefixKey = out.type === 'great' ? 'festival_great_prefix' : 'festival_today_prefix';
        out.descText = null;
        return out;
    }

    function _getGeneratedDailyFestival(dayIndex) {
        var idx = dayIndex % DAILY_FESTIVALS.length;
        if (idx < 0) idx = 0;
        var base = DAILY_FESTIVALS[idx];
        return {
            id: 'daily_smile_' + idx,
            type: 'minor',
            icon: base.icon,
            screen: 'home',
            nameKey: base.nameKey,
            descKey: base.descKey
        };
    }

    /**
     * Get current sky sign based on block number.
     * @param {number} blockNum
     * @returns {Object}
     */
    function getCurrentSky(blockNum) {
        var day = _getMoscowDayIndex();
        var idx = day % SKY_SIGNS.length;
        if (idx < 0) idx = 0;
        var sky = SKY_SIGNS[idx];
        var twist = SKY_TWISTS[Math.floor(day / SKY_SIGNS.length) % SKY_TWISTS.length];
        var out = {};
        for (var key in sky) if (sky.hasOwnProperty(key)) out[key] = sky[key];
        out.summaryText = twist;
        return out;
    }

    /**
     * Count available daily forecast combinations.
     * @returns {number}
     */
    function getForecastVariantCount() {
        return SKY_SIGNS.length * WEATHER.length;
    }

    /**
     * Get current magical weather based on block number.
     * This is a deterministic in-game forecast and affects hunts.
     * @param {number} blockNum
     * @returns {Object}
     */
    function getCurrentWeather(blockNum) {
        var day = _getMoscowDayIndex();
        var idx = Math.floor(day / SKY_SIGNS.length) % WEATHER.length;
        if (idx < 0) idx = 0;
        return WEATHER[idx];
    }


    /**
     * Get optional daily magical news. Flavor-only; does not affect combat.
     * @param {number} blockNum
     * @returns {Object|null}
     */
    function getCurrentMagicNews(blockNum) {
        var day = _getMoscowDayIndex();
        var idx = day % MAGIC_NEWS.length;
        if (idx < 0) idx = 0;
        return MAGIC_NEWS[idx];
    }

    /**
     * Check if Weave Surge is active.
     * @param {number} blockNum
     * @returns {Object|null} event info or null
     */
    function checkWeaveSurge(blockNum) {
        var cyclePos = blockNum % SURGE_INTERVAL;
        if (cyclePos < SURGE_DURATION) {
            return {
                type: 'weave_surge',
                nameKey: 'event_weave_surge',
                icon: '\uD83C\uDF0A',
                active: true,
                blocksRemaining: SURGE_DURATION - cyclePos,
                manaRegenMultiplier: 2
            };
        }
        return null;
    }

    /**
     * Check if Minor Rift is active.
     * @param {number} blockNum
     * @returns {Object|null}
     */
    function checkMinorRift(blockNum) {
        var cyclePos = blockNum % RIFT_INTERVAL;
        if (cyclePos < RIFT_DURATION) {
            return {
                type: 'minor_rift',
                nameKey: 'event_minor_rift',
                icon: '\uD83C\uDF00',
                active: true,
                blocksRemaining: RIFT_DURATION - cyclePos,
                rareSpawnBoost: true
            };
        }
        return null;
    }

    /**
     * Check if World Boss window is active.
     * @param {number} blockNum
     * @returns {Object|null}
     */
    function checkWorldBossWindow(blockNum) {
        var adjusted = (blockNum + BOSS_OFFSET) % BOSS_INTERVAL;
        if (adjusted < BOSS_WINDOW) {
            return {
                type: 'world_boss',
                nameKey: 'event_world_boss',
                icon: '\uD83D\uDC32',
                active: true,
                blocksRemaining: BOSS_WINDOW - adjusted,
                spawnBlock: blockNum - adjusted
            };
        }
        return null;
    }

    /**
     * Get all currently active events.
     * @param {number} blockNum
     * @returns {Array} list of active event objects
     */
    function getActiveEvents(blockNum) {
        var events = [];
        var surge = checkWeaveSurge(blockNum);
        if (surge) events.push(surge);
        var rift = checkMinorRift(blockNum);
        if (rift) events.push(rift);
        var boss = checkWorldBossWindow(blockNum);
        if (boss) events.push(boss);
        return events;
    }

    /**
     * Check event triggers (called each block in state engine).
     * Returns game events if transitions happened.
     * @param {number} blockNum
     * @param {number} prevBlock
     * @returns {Array} game events
     */
    function checkEventTriggers(blockNum, prevBlock) {
        var events = [];

        // Calendar seasons are real-world/Moscow-time now, not block-triggered.

        // Surge start
        var prevSurgePos = prevBlock % SURGE_INTERVAL;
        var curSurgePos = blockNum % SURGE_INTERVAL;
        if (prevSurgePos >= SURGE_DURATION && curSurgePos < SURGE_DURATION) {
            events.push({ type: 'weave_surge_start', blockNum: blockNum });
        }
        if (prevSurgePos < SURGE_DURATION && curSurgePos >= SURGE_DURATION) {
            events.push({ type: 'weave_surge_end', blockNum: blockNum });
        }

        // Rift start
        var prevRiftPos = prevBlock % RIFT_INTERVAL;
        var curRiftPos = blockNum % RIFT_INTERVAL;
        if (prevRiftPos >= RIFT_DURATION && curRiftPos < RIFT_DURATION) {
            events.push({ type: 'minor_rift_start', blockNum: blockNum });
        }

        // Boss window start
        var prevBossPos = (prevBlock + BOSS_OFFSET) % BOSS_INTERVAL;
        var curBossPos = (blockNum + BOSS_OFFSET) % BOSS_INTERVAL;
        if (prevBossPos >= BOSS_WINDOW && curBossPos < BOSS_WINDOW) {
            events.push({ type: 'world_boss_spawn', blockNum: blockNum });
        }
        if (prevBossPos < BOSS_WINDOW && curBossPos >= BOSS_WINDOW) {
            events.push({ type: 'world_boss_window_end', blockNum: blockNum });
        }

        return events;
    }

    /**
     * Get overview of upcoming events.
     * @param {number} blockNum
     * @returns {Array}
     */
    function getUpcomingEvents(blockNum) {
        var upcoming = [];

        // Next season
        upcoming.push({
            type: 'season_change',
            nameKey: 'event_next_season',
            blocksUntil: blocksUntilSeasonChange(blockNum),
            nextSeason: SEASONS[(_getMoscowSeasonIndex() + 1) % 4]
        });

        // Next surge
        var surgePos = blockNum % SURGE_INTERVAL;
        if (surgePos >= SURGE_DURATION) {
            upcoming.push({
                type: 'weave_surge',
                nameKey: 'event_weave_surge',
                blocksUntil: SURGE_INTERVAL - surgePos
            });
        }

        // Next boss
        var bossPos = (blockNum + BOSS_OFFSET) % BOSS_INTERVAL;
        if (bossPos >= BOSS_WINDOW) {
            upcoming.push({
                type: 'world_boss',
                nameKey: 'event_world_boss',
                blocksUntil: BOSS_INTERVAL - bossPos
            });
        }

        return upcoming;
    }

    return {
        SEASONS: SEASONS,
        getCurrentSeason: getCurrentSeason,
        getSeasonalBonuses: getSeasonalBonuses,
        getCurrentWeather: getCurrentWeather,
        getCurrentSky: getCurrentSky,
        getForecastVariantCount: getForecastVariantCount,
        getCurrentFestival: getCurrentFestival,
        getCurrentMagicNews: getCurrentMagicNews,
        getActiveEvents: getActiveEvents,
        checkEventTriggers: checkEventTriggers,
        checkWeaveSurge: checkWeaveSurge,
        checkMinorRift: checkMinorRift,
        checkWorldBossWindow: checkWorldBossWindow,
        getUpcomingEvents: getUpcomingEvents,
        blocksUntilSeasonChange: blocksUntilSeasonChange
    };
})();
