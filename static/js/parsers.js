/**
 * parsers.js - Logic for parsing and scoring motherboard specifications.
 * Separated from DOM manipulation for better maintainability (refactor/split).
 */

// Field-specific comparison rules
const FIELD_RULES = {
    // Fields to ignore in diff highlighting (never highlight these)
    'ignored_fields': [
        'release',
        'notes',
        'details',
        'color',
        'heatsink',
        'pcb',
        'primary',
        'accent',
        'textaccent',
        'superiocontroller',
        'super i/o',
        'lane-sharing',
        'bifurcation'
    ],

    // Lower is better
    'lower_is_better': [
        'amsrpusd',  // Price field
    ],

    // Custom rankings (best to worst) - exact text match
    'custom_rank': {
        'debug': {  // Matches any field with "debug" in name
            'LCD Display': 15,
            'LCD': 15,
            'Debug LEDs': 10,
            'Debug LED': 10,
            'POST code': 5,
            'POST': 5,
            'Power LED': 1,
            'None': 0,
            '-': 0,
            '': 0
        }
    }
};

/**
 * Check if a field should use "lower is better" logic
 */
function isLowerBetter(fieldName) {
    return FIELD_RULES.lower_is_better.some(field =>
        fieldName.toLowerCase().includes(field.toLowerCase())
    );
}

/**
 * Get custom rank for a value in a specific field
 */
function getCustomRank(fieldName, value) {
    const normalizedFieldName = fieldName.toLowerCase();
    const normalizedValue = value.trim();

    for (const [field, rankings] of Object.entries(FIELD_RULES.custom_rank)) {
        if (normalizedFieldName.includes(field.toLowerCase())) {
            // Try exact match first
            if (rankings[normalizedValue] !== undefined) {
                return rankings[normalizedValue];
            }

            // Try case-insensitive match
            for (const [rankKey, rankValue] of Object.entries(rankings)) {
                if (rankKey.toLowerCase() === normalizedValue.toLowerCase()) {
                    return rankValue;
                }
            }
        }
    }
    return null;
}

/**
 * Normalize LAN text to handle abbreviations and variations
 * e.g. "Rltk" -> "Realtek", "AQC113CS" -> "AQC113C"
 */
function normalizeLANText(text) {
    let norm = text;
    // Common abbreviations
    norm = norm.replace(/Rltk/ig, 'Realtek');
    norm = norm.replace(/AQC113CS/ig, 'AQC113C'); // Handle specific model variation
    // Remove all non-alphanumeric for robust matching
    return norm.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Extract distinct LAN controllers from text, handling sub-string overlaps.
 * Returns array of { name: str, speed: int }
 */
function getLanControllers(text) {
    if (!text || typeof LAN_SCORES === 'undefined') return [];

    const cleanText = normalizeLANText(text);
    let matches = [];

    // 1. Find all potential matches
    for (const [controller, speed] of Object.entries(LAN_SCORES)) {
        const cleanController = controller.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (cleanText.includes(cleanController)) {
            matches.push({ name: controller, speed: speed, clean: cleanController });
        }
    }

    // 2. Filter out substrings (e.g. if "RTL8111H" is found, ignore "RTL8111")
    const distinctMatches = matches.filter(m => {
        const isSubstring = matches.some(other =>
            other !== m && other.clean.includes(m.clean)
        );
        return !isSubstring;
    });

    return distinctMatches;
}

/**
 * Parse VRM configuration strings like "2x10+2+2" into total phase count
 */
function parseVRM(text) {
    if (!text || text === '-' || text === '') return null;

    // Pattern: "2x10+2+2" or "16+2+1" or just "16"
    const vrmPattern = /^(\d+)x(\d+)([+\d]+)?$/;
    const simplePattern = /^(\d+)([+\d]+)?$/;

    let match = text.match(vrmPattern);
    if (match) {
        const [, multiplier, base, additional] = match;
        let total = parseInt(multiplier) * parseInt(base);

        if (additional) {
            const extras = additional.match(/\d+/g);
            if (extras) {
                total += extras.reduce((sum, n) => sum + parseInt(n), 0);
            }
        }

        return { text, score: total, isNumeric: true, isVRM: true };
    }

    match = text.match(simplePattern);
    if (match) {
        const [, base, additional] = match;
        let total = parseInt(base);

        if (additional) {
            const extras = additional.match(/\d+/g);
            if (extras) {
                total += extras.reduce((sum, n) => sum + parseInt(n), 0);
            }
        }

        return { text, score: total, isNumeric: true, isVRM: true };
    }

    return null;
}

/**
 * Parse a value and extract numeric info for comparison
 */
function parseValue(text, fieldName) {
    if (!text || text === '-' || text === '') return null;

    // Custom LAN Controller parsing
    // Uses global LAN_SCORES injected from backend
    if (fieldName && fieldName.includes('LAN Controller') && typeof LAN_SCORES !== 'undefined') {
        const controllers = getLanControllers(text);
        if (controllers.length > 0) {
            const totalSpeed = controllers.reduce((sum, c) => sum + c.speed, 0);
            return { text, score: totalSpeed, isNumeric: true };
        }
    }

    // Custom Wireless parsing
    // Hierarchy: Gen 7 > 6E > 6 > 5 > Slot > None
    // Manufacturer: Intel > Qualcomm > Realtek > Mediatek > Generic
    if (fieldName && fieldName.includes('Wireless')) {
        let genScore = 0;

        if (text.includes('Wi-Fi 7')) genScore = 7000;
        else if (text.includes('Wi-Fi 6E')) genScore = 6000;
        else if (text.includes('Wi-Fi 6')) genScore = 5000; // Matches "Wi-Fi 6" but not 6E because we checked 6E first
        else if (text.includes('Wi-Fi 5')) genScore = 4000;

        if (genScore === 0) {
            if (text.includes('M.2')) return { text, score: 1000, isNumeric: true }; // Slot only
            return { text, score: 0, isNumeric: true }; // None/Unknown
        }

        let mfgBonus = 100; // Default generic
        const lower = text.toLowerCase();

        // MFR Detection
        if (lower.includes('intel') || lower.includes('killer') || lower.includes('ax2') || lower.includes('ax1') || lower.includes('be2')) {
            mfgBonus = 500;
        } else if (lower.includes('qualcomm') || lower.includes('qcn') || lower.includes('ncm')) {
            mfgBonus = 400;
        } else if (lower.includes('realtek') || lower.includes('rtl')) {
            mfgBonus = 300;
        } else if (lower.includes('mediatek') || lower.includes('mt') || lower.includes('rz') || lower.includes('amd')) {
            mfgBonus = 200;
        }

        return { text, score: genScore + mfgBonus, isNumeric: true };
    }

    // Custom VRM (VCore) parsing
    // Hierarchy: SPS (Tier 2) > DrMOS (Tier 1) > Discrete/Other (Tier 0)
    // Score = (Tier * 1000) + Amperage
    if (fieldName && fieldName.includes('VRM (VCore)')) {
        let tier = 0;
        let amps = 0;

        // Determine Tier
        if (text.includes('SPS')) {
            tier = 2;
        } else if (text.includes('DrMOS')) {
            tier = 1;
        }

        // Determine Amperage
        // Look for "XXA" or "XX A"
        const ampMatch = text.match(/(\d+)\s*A/);
        if (ampMatch) {
            amps = parseInt(ampMatch[1]);
        }

        const score = (tier * 1000) + amps;
        return { text, score: score, isNumeric: true };
    }

    // Custom "Total M.2 (M)" parsing: "5(+2)" -> 5 Onboard + 2 AIC
    // Priority: Total Count > Onboard Count
    if (fieldName && fieldName.includes('Total M.2')) {
        // Check for "X(+Y)" format
        const match = text.match(/(\d+)\(\+(\d+)\)/);
        if (match) {
            const onboard = parseInt(match[1]);
            const extra = parseInt(match[2]);
            const total = onboard + extra;
            return { text, score: (total * 100) + onboard, isNumeric: true };
        }

        // Fallback for simple numbers "5" in this field
        const simple = text.match(/^\d+$/);
        if (simple) {
            const val = parseInt(simple[0]);
            return { text, score: (val * 100) + val, isNumeric: true };
        }
    }

    // Custom M.2 parsing: "1*4x4" -> Count * Gen x Lanes
    // Priority: Total Slots > Bandwidth
    if (fieldName && (fieldName.includes('M.2') || fieldName.includes('m.2'))) {
        const m2Regex = /(\d+)\*(\d+)x(\d+)/g;
        let totalSlots = 0;
        let bandwidthScore = 0;
        let match;
        let found = false;

        while ((match = m2Regex.exec(text)) !== null) {
            found = true;
            const count = parseInt(match[1]);
            const gen = parseInt(match[2]);
            const lanes = parseInt(match[3]);

            totalSlots += count;
            bandwidthScore += count * ((gen * 100) + lanes);
        }

        if (found) {
            const finalScore = (totalSlots * 1000000) + bandwidthScore;
            return { text, score: finalScore, isNumeric: true };
        }
    }

    const numbers = text.match(/\d+/g);

    // Custom USB-C header parsing: "1*20g 1*10g" -> 30
    if (/(\d+)\*\d+g/.test(text)) {
        const matches = text.match(/(\d+)\*(\d+)g/g);
        if (matches) {
            const totalSpeed = matches.reduce((sum, part) => {
                const parts = part.match(/(\d+)\*(\d+)g/);
                return sum + (parseInt(parts[1]) * parseInt(parts[2]));
            }, 0);
            return { text, score: totalSpeed, isNumeric: true };
        }
    }

    // Custom PCIe Slot parsing for "x16 Electrical"
    // Format: "5x16, 3x2" (Gen 5 x16, Gen 3 x2)
    // Logic: Hierarchical comparison. Slot 1 > Slot 2 > etc.
    if (fieldName && fieldName.toLowerCase().includes('x16 electrical')) {
        const slots = text.match(/(\d+)x(\d+)/g);
        if (slots) {
            let totalScore = 0;
            const maxSlots = 4;

            slots.slice(0, maxSlots).forEach((slot, index) => {
                const parts = slot.match(/(\d+)x(\d+)/);
                const gen = parseInt(parts[1]);
                const lanes = parseInt(parts[2]);
                const slotScore = (gen * 100) + lanes;
                const weight = Math.pow(1000, maxSlots - 1 - index);
                totalScore += slotScore * weight;
            });
            return { text, score: totalScore, isNumeric: true };
        }
    }

    if (!numbers) return { text, score: 0, isNumeric: false };

    if (numbers.length === 1 && /^\d+$/.test(text.trim())) {
        return { text, score: parseInt(numbers[0]), isNumeric: true };
    }

    if (/^\d+\+\d+/.test(text)) {
        const sum = numbers.reduce((a, b) => a + parseInt(b), 0);
        return { text, score: sum, isNumeric: true };
    }

    if (/\d+x\d+/.test(text)) {
        return { text, score: parseInt(numbers[0]), isNumeric: true };
    }

    if (/\d+\*\d+x\d+/.test(text)) {
        const matches = text.match(/(\d+)\*\d+x\d+/g);
        if (matches) {
            const totalSlots = matches.reduce((sum, match) => {
                const count = parseInt(match.match(/^(\d+)/)[1]);
                return sum + count;
            }, 0);
            return { text, score: totalSlots, isNumeric: true };
        }
    }

    return { text, score: parseInt(numbers[0]), isNumeric: numbers.length > 0 };
}
