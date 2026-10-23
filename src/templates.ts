import type {Template} from './types';
const ok=(id:string,section:string,label:string,photoOnFail=true):any=>({id,section,label,type:'ok_nok',required:true,allowNA:true,photoOnFail});
export const templates:Template[]=[
{id:'visual-hv6-v1',code:'660.0-E.500.01',name:'Vizuálna kontrola vnútorného vybavenia',vehicleSeries:'HV6',version:'1',description:'Vstupná/výstupná vizuálna kontrola s fotodokumentáciou nezhôd.',fields:[
...['Sedadlo strojvodcu','Sedadlo sklopné','Stolík strojvodcu','Elektrická roleta čelného skla','Rolety bočných okien','Bezpečnostné kladivko','Vešiak','Lekárnička','Ručný hasiaci prístroj'].map((x,i)=>ok(`cab-${i+1}`,'Kabína strojvodcu',x)),
...['Vodný hasiaci prístroj','Rolety oddielu cestujúcich','Držiaky bicyklov','Držiaky lyží','Madlá','Zábradlie 1','Zábradlie 2','Madlá pri dverách','Odpadkový kôš'].map((x,i)=>ok(`sal-${i+1}`,'Oddiel cestujúcich',x)),
...Array.from({length:14},(_,i)=>ok(`seat-${i+1}`,'Sedadlá cestujúcich',`Sedadlo / pozícia ${i+1}`)),
ok('tables','Stolíky','Pevné stolíky s košom'),...Array.from({length:8},(_,i)=>ok(`screen-${i+1}`,'Zásteny',`Zástena typ ${i+1}`)),...Array.from({length:3},(_,i)=>ok(`rack-${i+1}`,'Batožinové police',`Batožinová polica typ ${i+1}`))]},
{id:'ndt-hv6-v1',code:'660.0-E.000.92',name:'Správa z defektoskopie',vehicleSeries:'HV6',version:'1',description:'Pilot NDT protokolu s metódou, počtom kusov a výsledkom.',fields:[
{ id:'ndt-axle',section:'Dvojkolesie',label:'Náprava dvojkolesia',type:'ndt',required:true,quantity:4,options:['VT','MT','UT','PT'],defaultMethod:'UT'},
{ id:'ndt-face',section:'Dvojkolesie',label:'Čelo nápravy',type:'ndt',required:true,quantity:8,options:['VT','MT','UT','PT'],defaultMethod:'VT'},
{ id:'ndt-wheel',section:'Dvojkolesie',label:'Jazdná plocha a okolesník',type:'ndt',required:true,quantity:8,options:['VT','MT','UT','PT'],defaultMethod:'UT'},
{ id:'ndt-disc',section:'Brzda',label:'Brzdový kotúč',type:'ndt',required:true,quantity:8,options:['VT','MT'],defaultMethod:'VT/MT'},
{ id:'ndt-frame',section:'Podvozok',label:'Rám podvozku',type:'ndt',required:true,quantity:2,options:['VT','MT','PT'],defaultMethod:'VT/MT'}]},
{id:'gluing-hv5-v1',code:'660.8-P.675.01',name:'Lepenie čelného okna a bočných skiel',vehicleSeries:'HV5',version:'1',description:'Výrobný protokol s meraniami, toleranciami, materiálmi a časmi.',fields:[
{id:'humidity-before',section:'Podmienky prostredia',label:'Relatívna vlhkosť pred lepením',type:'number',unit:'%',required:true,rule:{kind:'range',min:30,max:70}},
{id:'temp-before',section:'Podmienky prostredia',label:'Teplota vzduchu pred lepením',type:'number',unit:'°C',required:true,rule:{kind:'range',min:18,max:29}},
{id:'instrument',section:'Podmienky prostredia',label:'Číslo meracieho prístroja',type:'text',required:true},
{id:'start',section:'Časový priebeh',label:'Začiatok lepenia',type:'datetime',required:true},{id:'end',section:'Časový priebeh',label:'Ukončenie lepenia',type:'datetime',required:true},
{id:'cleaner',section:'Materiály',label:'Čistič / označenie',type:'text',required:true},{id:'cleaner-batch',section:'Materiály',label:'Čistič / číslo šarže',type:'text',required:true},{id:'cleaner-exp',section:'Materiály',label:'Čistič / trvanlivosť do',type:'date',required:true},
{id:'primer',section:'Materiály',label:'Primer / označenie',type:'text',required:true},{id:'primer-batch',section:'Materiály',label:'Primer / číslo šarže',type:'text',required:true},{id:'primer-exp',section:'Materiály',label:'Primer / trvanlivosť do',type:'date',required:true},
{id:'glue-thickness',section:'Kontrola lepenia',label:'Hrúbka vrstvy lepidla',type:'number',unit:'mm',required:true,rule:{kind:'tolerance',target:6,minus:1,plus:1},repeatBy:['Čelné okno','Bočné okno Ľ','Bočné okno P'],photoOnFail:true},
{id:'humidity-after',section:'Podmienky po lepení',label:'Relatívna vlhkosť po lepení',type:'number',unit:'%',required:true,rule:{kind:'range',min:30,max:70}},{id:'temp-after',section:'Podmienky po lepení',label:'Teplota po lepení',type:'number',unit:'°C',required:true,rule:{kind:'range',min:18,max:29}}]},
{id:'test-drive-v1',code:'660.J-P.000.98',name:'Skúšobná jazda jednotky',vehicleSeries:'HV5/VV5/VV6/HV6',version:'1',description:'Kombinovaný hierarchický protokol celej jednotky.',fields:[
{id:'route',section:'Jazda',label:'Úsek trate',type:'text',required:true},{id:'km',section:'Jazda',label:'Počet prejdených kilometrov',type:'number',unit:'km',required:true,rule:{kind:'min',min:1}},
...['Vonkajšie osvetlenie','Klimatizácia','Vykurovanie a vetranie','Dvere','WC','Brzdový systém'].flatMap((x,i)=>['HV5','VV5','VV6','HV6'].map(v=>({...ok(`drive-${i}-${v}`,'Funkčné skúšky',`${x} – ${v}`),group:x}))),
...['3 kV DC','25 kV AC'].flatMap((sys,i)=>['Rozjazd','Brzdenie','Pomocné stroje','VN výzbroj'].map((x,j)=>({...ok(`power-${i}-${j}`,'Jazdná skúška',`${x} – ${sys}`),group:sys}))),
{id:'faults',section:'Záver',label:'Zistené poruchy',type:'text'}, {id:'overall',section:'Záver',label:'Celkové vyhodnotenie',type:'single_choice',required:true,options:['Vyhovel','Nevyhovel – skúšku opakovať']}]}
];
