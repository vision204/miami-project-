// Codes 128..135 are reserved for the current server-calculated tier. Other cosmetics stay untouched.
export const TIER_BADGE_ORDER=['bronze','silver','gold','platinum','diamond','master','grandmaster','challenger'];
export function sanitizeTierBadge(v,tier){const out=v.slice();if(out[11]>=128&&out[11]<=135&&out[11]!==128+TIER_BADGE_ORDER.indexOf(tier))out[11]=0;return out;}
