// Shared game rules. No client-supplied radius, damage, targets or impact time.
export const BOMB_RULES=Object.freeze({radius:90,fxView:1800,fxLife:12,gravity:24,cooldown:2500,maxActive:3,maxRoom:24,minAltitude:12,maxAltitude:3100,player:180,vehicle:900,npc:210});
export function bombFlight(origin,ground){const height=origin[1]-ground;return Math.sqrt(2*height/BOMB_RULES.gravity);}
export function bombDamage(distance,kind='player'){if(!Number.isFinite(distance)||distance>BOMB_RULES.radius||distance<0)return 0;return Math.round(BOMB_RULES[kind]*(1-.68*distance/BOMB_RULES.radius));}
export function bombInside(pos,center){return Math.abs(pos[1]-center[1])<=BOMB_RULES.radius&&Math.hypot(pos[0]-center[0],pos[2]-center[2])<=BOMB_RULES.radius;}

export function bombFighter(id){return typeof id==='string'&&(id.startsWith('fighter_')||id==='war_boram');}
