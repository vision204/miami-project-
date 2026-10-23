// Shared airport layout. tools/apply-airport-project.mjs copies this to assets/aviation.
export const AIRPORTS_LAYOUT={revision:3,fare:1000,boardingMs:2200,terminals:[
 {id:'mia',name:'MIAMI INTERNATIONAL',destination:'SUNHORN AIRPORT',x:-3350,z:-665,y:3.65,w:420,d:110,height:44,ticket:{x:-3370,z:-650},arrival:{x:-3350,y:3.7,z:-625,yaw:-1.5707963267948966}},
 {id:'sunhorn',name:'SUNHORN AIRPORT',destination:'MIAMI INTERNATIONAL',x:-6170,z:8255,y:8.85,w:220,d:72,height:12,ticket:{x:-6190,z:8270},arrival:{x:-6170,y:8.9,z:8275,yaw:-1.5707963267948966}}
],miaApron:{x0:-3630,x1:-3070,z0:-830,z1:-585},miaRunways:[
 {x0:-4230,x1:-2470,z:-875,w:45,number:'09L'},
 {x0:-4230,x1:-2470,z:-510,w:45,number:'09C'},
 {x0:-4230,x1:-2470,z:-350,w:54,number:'09R'}
],miaTaxi:[{x0:-4230,x1:-2470,z:-945,w:24},{x0:-4230,x1:-2470,z:-555,w:22},{x0:-4230,x1:-2470,z:-425,w:22}],hangars:{
 hangar_prestige:{x:-3900,z:-1020,front:1},hangar_executive:{x:-3690,z:-1020,front:1},hangar_business:{x:-3520,z:-1020,front:1},
 hangar_starter:{x:-3540,z:-3510},hangar_club:{x:-3420,z:-3510},hangar_standard:{x:-3290,z:-3510}
}};
export function airportTerminal(id){return AIRPORTS_LAYOUT.terminals.find(t=>t.id===id);}
export function airportDestination(id){return AIRPORTS_LAYOUT.terminals.find(t=>t.id!==id);}
