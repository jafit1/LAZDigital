'use strict';
/* Saldo final hasil audit Data Final.xlsx: uji bahwa angka lembar audit
   dipakai apa adanya, dapat dihapus, dan tidak mengubah mesin lama. */
const path=require('path');
const engine=require(path.join(__dirname,'..','api','_engine.js'));
const skema=require(path.join(__dirname,'..','lib','laz-skema.js'));
let ok=0,gagal=0;
const cek=(n,s,info)=>{if(s){ok++;console.log('  OK   | '+n)}else{gagal++;console.log('  GAGAL| '+n+' '+(info===undefined?'':JSON.stringify(info)))}};
const baris=[
 {alias:'KLL_Uji',dana:'Infak_Umum',umkAwal:0,awal:1000,himpun:5000,amil:1000,salur:2000,umkAkhir:500,akhir:2500},
 {alias:'KLL_Uji',dana:'Amil',umkAwal:0,awal:0,himpun:0,amil:1000,salur:0,umkAkhir:0,akhir:1000}
];
(async()=>{
 process.env.SETUP_ADMIN_PASSWORD='Contoh1234';
 const s={};for(const n of skema.NAMA_TABEL)s[n]=[];
 let db=(await engine.runRPC({sheets:s,props:{}},'setup',[],{})).db;
 const call=async(fn,args)=>{const o=await engine.runRPC(db,fn,args,{});db=o.db;return o.result};
 const T=(await call('login',['superadmin','Contoh1234',false])).token;
 const d=await call('apiSaldoDaerahRinci',[T,'2026-11-30']);
 cek('tanpa saldo final, mesin lama tetap jalan',d.total===0,d.total);
 const r=await call('apiSimpanSaldoFinalAnalisa',[T,'2026',baris]);
 cek('saldo final tersimpan 2 baris',r.ok&&r.baris===2,r);
 const a=await call('apiSaldoDaerahRinci',[T,'2026-11-30']);
 const k=await call('apiSaldoKantorRinci',[T,'2026-11-30','kll']);
 cek('total memakai angka lembar audit',k.total===3500,k.total);
 cek('saldo awal memakai kolom Saldo Kas Awal',k.pembuka===1000,k.pembuka);
 cek('hak amil dikembalikan ke dana Amil',(k.daftar[0].dana.find(x=>x.dana==='Amil')||{}).akhir===1000,k.daftar[0].dana);
 cek('semua baris seimbang',k.tidakSeimbang.length===0,k.tidakSeimbang);
 const salah=baris.map(x=>({...x}));salah[0].akhir=9999;
 await call('apiSimpanSaldoFinalAnalisa',[T,'2026',salah]);
 const b=await call('apiSaldoKantorRinci',[T,'2026-11-30','kll']);
 cek('baris yang tidak balance dilaporkan',b.tidakSeimbang.length===1&&b.tidakSeimbang[0].selisih===7499,b.tidakSeimbang);
 await call('apiHapusSaldoFinalAnalisa',[T,'2026']);
 const c=await call('apiSaldoKantorRinci',[T,'2026-11-30','kll']);
 cek('hapus saldo final mengembalikan mesin lama',c.total===0&&!c.final,c);
 console.log('\nHASIL: '+ok+' lulus, '+gagal+' gagal');
 process.exitCode=gagal?1:0;
})().catch(e=>{console.error('ERR',e);process.exitCode=1});