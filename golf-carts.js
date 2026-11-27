// Shared server/client catalogue. Golf-only vehicles, bought with in-game cash.
export const GOLF_CARTS=Object.freeze([
 {id:'caddie_classic',name:'BISCAYNE CADDIE',price:12500,color:0x176b57,style:'classic',caption:'클래식 크림 차체 · 딥그린 루프'},
 {id:'dune_runner',name:'DUNE RUNNER',price:32000,color:0xcb7442,style:'sport',caption:'넓은 펜더 · 샌드 컬러 · 스포츠 범퍼'},
 {id:'crown_tourer',name:'CROWN TOURER',price:68000,color:0x233d68,style:'tourer',caption:'네이비 차체 · 아이보리 루프 · 골드 트림'},
].map(Object.freeze));
export const golfCartId=property=>GOLF_CARTS.some(q=>q.id===property?.golfCart?.equipped&&property.golfCart.owned?.includes(q.id))?property.golfCart.equipped:'caddie_classic';
