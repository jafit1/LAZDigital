'use strict';
/* Rotasi kode akses KL: kode lama harus mati, kode baru harus langsung jalan. */
const path=require('path');
const engine=require(path.join(__dirname,'..','api','_engine.js'));
const skema=require(path.join(__dirname,'..','lib','laz-skema.js'));
let ok=0,gagal=0;
const cek=(n,s,i)=>{if(s){ok++;console.log('  OK   | '+n)}else{gagal++;console.log('  GAGAL| '+n+' '+(i===undefined?'':JSON.stringify(i)))}};
(async()=>{
 process.env.SETUP_ADMIN_PASSWORD='Contoh1234';
 const s={};for(const n of skema.NAMA_TABEL)s[n]=[];
 let db=(await engine.runRPC({sheets:s,props:{}},'setup',[],{})).db;
 const call=async(fn,a)=>{const o=await engine.runRPC(db,fn,a,{});db=o.db;return o.result};
 const T=(await call('login',['superadmin','Contoh1234',false])).token;
 await call('apiSimpanSaldoAwalAnalisa',[T,'2026',[{nama:'KLL Uji',dana:'Infak_Umum',nominal:1000}]]);
 const lama=(await call('apiBuatKodeAksesKL',[T])).daftar[0];
 const rot=await call('apiRotasiKodeAksesKL',[T]);
 const baru=rot.daftar[0];
 cek('satu kode baru diterbitkan',rot.ok&&rot.jumlah===1&&/^KL-[0-9A-F]{8}$/.test(baru.kode),rot);
 cek('nilai kode benar-benar berubah',baru.kode!==lama.kode,{lama:lama.kode,baru:baru.kode});
 const buka=async(k)=>{try{return (await call('apiSaldoKLPublik',[k,'2026-11-30'])).total===1000}catch(e){return false}};
 cek('kode lama ditolak',!(await buka(lama.kode)));
 cek('kode baru langsung berfungsi',await buka(baru.kode));
 const daftar=(await call('apiDaftarKodeAksesKL',[T])).daftar;
 cek('peta hanya memuat kode baru',daftar.length===1&&daftar[0].kode===baru.kode,daftar);
 console.log('\nHASIL: '+ok+' lulus, '+gagal+' gagal');
 process.exitCode=gagal?1:0;
})().catch(e=>{console.error('ERR',e);process.exitCode=1});