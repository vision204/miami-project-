/* 2026-11-02 Opus · BISCAYNE GOLF 클럽하우스 랭킹보드
   · 로그인한 사람이 라운드를 끝까지 치면 서버가 기록을 모은다 (Firestore golfRanks/{uid}).
   · 점수 = 판수×10 (최대 50판 = 500점) + (3 − 홀당 평균 오버파)×100   ← 많이 치고, 적게 칠수록 높다
     판수는 3홀 = 1판으로 센다 (6홀 라운드 = 2판). 같은 점수면 평균 오버파가 낮은 쪽, 그다음 판수가 많은 쪽.
   · 보드는 상위 50명 + 내 순위. 목록은 20초 동안 캐시한다.
   · 부정 방지(가벼운 수준) : 코스 안에서 'begin' 을 보낸 뒤에만, 남은 홀 수×15초가 지나야, 홀마다 1~(파+5)타만 받는다. */
export const GOLF_PARS=[4,4,3,3,3,4];                    // assets/sports/golf-links.js HOLES 순서 (2026-11-02 실제 실행에서 읽음)
const COURSE={x:-943,z:2833,r:650},HOLE_SEC=15,TOP=50,CACHE_MS=20000;
export function golfScore(row){
 const holes=row.holes|0;if(holes<=0)return 0;const rounds=holes/3,avgOver=row.over/holes;
 return Math.round((Math.min(rounds,50)*10+Math.max(0,3-avgOver)*100)*10)/10;
}
export function golfOrder(a,b){return b.score-a.score||a.over/a.holes-b.over/b.holes||b.holes-a.holes||a.at-b.at;}
const cleanName=n=>String(n||'플레이어').replace(/[\u0000-\u001f<>]/g,'').slice(0,16)||'플레이어';
const view=d=>({n:cleanName(d.name),h:d.holes|0,s:d.strokes|0,o:d.over|0,score:d.score});

export class GolfRanks{
 constructor(backend,{send,now=()=>Date.now()}={}){this.backend=backend;this.send=send;this.now=now;this.top=null;this.topAt=0;this.loading=null;}
 db(){return this.backend()?.db||null;}
 receive(peer,m){
  if(!m||typeof m!=='object')return;const now=this.now();
  if(m.k==='begin'){
   const holes=m.holes|0,from=m.from|0;if(!peer.uid||![3,6].includes(holes)||from<0||from>=holes)return;
   if(now-(peer.stateAt||0)>10000||Math.hypot(peer.s[0]-COURSE.x,peer.s[2]-COURSE.z)>COURSE.r)return;
   peer.golfRound={holes,from,at:now};return;}
  if(m.k==='submit'){
   const g=peer.golfRound,card=m.card;peer.golfRound=null;
   if(!peer.uid){this.send(peer.ws,{t:'golfrank',k:'saved',ok:false,why:'login'});return;}
   if(!g||m.holes!==g.holes||!Array.isArray(card)||card.length!==g.holes||now-g.at<(g.holes-g.from)*HOLE_SEC*1000||now-g.at>3*3600*1000){this.send(peer.ws,{t:'golfrank',k:'saved',ok:false,why:'round'});return;}
   for(let i=0;i<card.length;i++)if(!Number.isInteger(card[i])||card[i]<1||card[i]>GOLF_PARS[i]+5){this.send(peer.ws,{t:'golfrank',k:'saved',ok:false,why:'card'});return;}
   this.save(peer.uid,peer.name,card).then(r=>this.send(peer.ws,{t:'golfrank',k:'saved',ok:true,...r})).catch(()=>this.send(peer.ws,{t:'golfrank',k:'saved',ok:false,why:'server'}));return;}
  if(m.k==='board'){
   if(now-(peer.golfBoardAt||0)<2500)return;peer.golfBoardAt=now;
   this.board(peer.uid).then(b=>this.send(peer.ws,{t:'golfrank',k:'board',...b})).catch(()=>this.send(peer.ws,{t:'golfrank',k:'board',off:true,top:[],me:null,login:!!peer.uid}));}
 }
 async save(uid,name,card){
  const db=this.db();if(!db)throw Error('offline');const ref=db.doc('golfRanks/'+uid),now=this.now();
  const strokes=card.reduce((a,b)=>a+b,0),over=card.reduce((a,b,i)=>a+b-GOLF_PARS[i],0);
  const row=await db.runTransaction(async tx=>{const d=(await tx.get(ref)).data()||{holes:0,strokes:0,over:0,rounds:0,best:null};
   const r={name:cleanName(name),holes:(d.holes|0)+card.length,strokes:(d.strokes|0)+strokes,over:(d.over|0)+over,rounds:(d.rounds|0)+1,best:d.best==null?over:Math.min(d.best,over),at:now};r.score=golfScore(r);tx.set(ref,r);return r;});
  this.top=null;return {row:view(row),round:{holes:card.length,strokes,over}};
 }
 async list(){
  const now=this.now();if(this.top&&now-this.topAt<CACHE_MS)return this.top;if(this.loading)return this.loading;
  const db=this.db();if(!db)throw Error('offline');
  this.loading=db.collection('golfRanks').orderBy('score','desc').limit(TOP+10).get().then(q=>{const rows=q.docs.map(d=>({uid:d.id,...d.data()})).filter(r=>r.holes>0).sort(golfOrder).slice(0,TOP);this.top=rows;this.topAt=this.now();return rows;}).finally(()=>{this.loading=null;});
  return this.loading;
 }
 async board(uid){
  const rows=await this.list(),top=rows.map(view);let me=null;
  if(uid){const i=rows.findIndex(r=>r.uid===uid);
   if(i>=0)me={rank:i+1,...top[i]};
   else{const db=this.db(),d=(await db.doc('golfRanks/'+uid).get()).data();if(d&&d.holes>0){const ahead=(await db.collection('golfRanks').where('score','>',d.score).count().get()).data().count;me={rank:ahead+1,...view(d)};}}}
  return {top,me,login:!!uid};
 }
}
