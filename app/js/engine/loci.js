/**
 * Viz Magic — Dynamic Loci System
 * 'Words Create Worlds': Voice posts awakened into game locations.
 * Growth tiers based on engagement.
 */
var LociSystem = (function() {
    'use strict';

    /** Growth tiers: name → {threshold, royaltyPercent, icon, nameKey} */
    var TIERS = {
        camp:     { threshold: 0,   royaltyPercent: 2, icon: '\u26FA',        nameKey: 'loci_tier_camp' },
        village:  { threshold: 10,  royaltyPercent: 2, icon: '\uD83C\uDFD8\uFE0F', nameKey: 'loci_tier_village' },
        town:    { threshold: 50,  royaltyPercent: 3, icon: '\uD83C\uDFD9\uFE0F', nameKey: 'loci_tier_town' },
        city:    { threshold: 200, royaltyPercent: 4, icon: '\uD83C\uDFDB\uFE0F', nameKey: 'loci_tier_city' },
        citadel: { threshold: 500, royaltyPercent: 5, icon: '\uD83C\uDFF0',       nameKey: 'loci_tier_citadel' }
    };

    /** Locus types */
    var LOCUS_TYPES = ['market', 'quest_hub', 'forge', 'sanctuary', 'dungeon', 'camp'];

    /** Tier order for lookup */
    var TIER_ORDER = ['citadel', 'city', 'town', 'village', 'camp'];

    /**
     * Create a new locus from a Voice post.
     * @param {string} creator - VIZ account
     * @param {string} voiceRef - block number of the Voice post
     * @param {string} name - locus name
     * @param {string} locusType - one of LOCUS_TYPES
     * @param {string} regionId - which game region
     * @param {number} blockNum
     * @returns {Object} locus definition
     */
    function createLocus(creator, voiceRef, name, locusType, regionId, blockNum) {
        if (LOCUS_TYPES.indexOf(locusType) === -1) {
            locusType = 'camp';
        }

        return {
            id: 'loc_' + voiceRef,
            creator: creator,
            voiceRef: voiceRef,
            name: name || 'Unnamed Locus',
            type: locusType,
            region: regionId || 'commons_first_light',
            createdBlock: blockNum,
            tier: 'camp',
            engagement: {
                replies: 0,
                blessings: 0,
                reposts: 0,
                total: 0
            },
            active: true,
            lastUpdateBlock: blockNum
        };
    }

    /**
     * Update engagement counts for a locus.
     * @param {Object} locus
     * @param {string} engagementType - 'reply', 'blessing', 'repost'
     * @param {number} count
     */
    function addEngagement(locus, engagementType, count) {
        if (!locus || !locus.engagement) return;
        count = count || 1;

        switch (engagementType) {
            case 'reply':    locus.engagement.replies += count; break;
            case 'blessing': locus.engagement.blessings += count; break;
            case 'repost':   locus.engagement.reposts += count; break;
        }

        locus.engagement.total = locus.engagement.replies +
                                  locus.engagement.blessings +
                                  locus.engagement.reposts;
    }

    /**
     * Update tier based on current engagement.
     * @param {Object} locus
     * @returns {boolean} true if tier changed
     */
    function updateLocusTier(locus) {
        if (!locus) return false;
        var total = locus.engagement.total;
        var oldTier = locus.tier;

        for (var i = 0; i < TIER_ORDER.length; i++) {
            var tierName = TIER_ORDER[i];
            if (total >= TIERS[tierName].threshold) {
                locus.tier = tierName;
                break;
            }
        }

        return locus.tier !== oldTier;
    }

    /**
     * Get details for a locus (for UI display).
     * @param {Object} locus
     * @returns {Object}
     */
    function getLocusDetails(locus) {
        if (!locus) return null;
        var tierDef = TIERS[locus.tier] || TIERS.camp;

        return {
            id: locus.id,
            name: locus.name,
            creator: locus.creator,
            type: locus.type,
            region: locus.region,
            tier: locus.tier,
            tierIcon: tierDef.icon,
            tierNameKey: tierDef.nameKey,
            royaltyPercent: tierDef.royaltyPercent,
            engagement: locus.engagement,
            nextTier: _getNextTier(locus.tier),
            progressToNext: _getProgressToNext(locus)
        };
    }

    /**
     * Get loci by region.
     * @param {Object} lociState - map of id→locus
     * @param {string} regionId
     * @returns {Array}
     */
    function getLociByRegion(lociState, regionId) {
        if (!lociState) return [];
        var result = [];
        for (var id in lociState) {
            if (!lociState.hasOwnProperty(id)) continue;
            if (lociState[id].region === regionId && lociState[id].active) {
                result.push(lociState[id]);
            }
        }
        // Sort by tier (higher first)
        result.sort(function(a, b) {
            return TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
        });
        return result;
    }

    /**
     * Get all loci sorted by engagement.
     * @param {Object} lociState
     * @returns {Array}
     */
    function getAllLoci(lociState) {
        if (!lociState) return [];
        var result = [];
        for (var id in lociState) {
            if (lociState.hasOwnProperty(id) && lociState[id].active) {
                result.push(lociState[id]);
            }
        }
        result.sort(function(a, b) {
            return b.engagement.total - a.engagement.total;
        });
        return result;
    }

    /**
     * Calculate creator royalty for an action at a locus.
     * @param {Object} locus
     * @param {number} energySpent
     * @returns {number} royalty amount (basis points)
     */
    function calculateRoyalty(locus, energySpent) {
        if (!locus) return 0;
        var tierDef = TIERS[locus.tier] || TIERS.camp;
        return Math.floor(energySpent * tierDef.royaltyPercent / 100);
    }

    function _getNextTier(currentTier) {
        var idx = TIER_ORDER.indexOf(currentTier);
        if (idx <= 0) return null; // already at citadel or not found
        return {
            name: TIER_ORDER[idx - 1],
            threshold: TIERS[TIER_ORDER[idx - 1]].threshold
        };
    }

    function _getProgressToNext(locus) {
        var nextTier = _getNextTier(locus.tier);
        if (!nextTier) return { percent: 100, remaining: 0 };
        var currentThreshold = TIERS[locus.tier].threshold;
        var nextThreshold = nextTier.threshold;
        var range = nextThreshold - currentThreshold;
        var progress = locus.engagement.total - currentThreshold;
        return {
            percent: Math.min(100, Math.floor((progress / range) * 100)),
            remaining: Math.max(0, nextThreshold - locus.engagement.total)
        };
    }

    return {
        TIERS: TIERS,
        LOCUS_TYPES: LOCUS_TYPES,
        createLocus: createLocus,
        addEngagement: addEngagement,
        updateLocusTier: updateLocusTier,
        getLocusDetails: getLocusDetails,
        getLociByRegion: getLociByRegion,
        getAllLoci: getAllLoci,
        calculateRoyalty: calculateRoyalty
    };
})();
