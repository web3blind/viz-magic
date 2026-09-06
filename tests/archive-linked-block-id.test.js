'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {ArchiveStore}=require('../tools/archive-node/storage');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'viz-linked-id-'));
const store=new ArchiveStore(dir);
try {
 const put=store.db.prepare('INSERT INTO blocks(block_num,block_id,previous,raw_json) VALUES(?,?,?,?)');
 const id='04f557fbbd7cc30eb95f06e2c42b2338b2dac41d';
 put.run(83187707,'','04f557fa289b66865c82df9b281f7507a1eed35a','{}');
 assert.strictEqual(store.getBlockRecord(83187707).block_id,'');
 put.run(83187708,'',id,'{}');
 assert.strictEqual(store.getBlockRecord(83187707).block_id,id);
 assert.strictEqual(store.getBlockRecord(83187707).block.block_id,id);
 assert.strictEqual(store.db.prepare('SELECT block_id FROM blocks WHERE block_num=?').get(83187707).block_id,'');
 store.db.prepare('UPDATE blocks SET previous=? WHERE block_num=?').run('04f557fc'+ 'a'.repeat(32),83187708);
 assert.strictEqual(store.getBlockRecord(83187707).block_id,'');
 store.db.prepare('UPDATE blocks SET previous=? WHERE block_num=?').run('invalid',83187708);
 assert.strictEqual(store.getBlockRecord(83187707).block_id,'');
 console.log('PASS linked block IDs: exact next header, height check, no DB mutation');
} finally {store.db.close();fs.rmSync(dir,{recursive:true,force:true});}
