const mongoose = require('../server/node_modules/mongoose');
(async () => {
 await mongoose.connect(process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/insurance_claims_engineering');
 const claims = await mongoose.connection.db.collection('claims').find({title:/SYNTHETIC/}).toArray();
 const evidence = await mongoose.connection.db.collection('evidences').countDocuments();
 const audits = await mongoose.connection.db.collection('audits').countDocuments();
 if (!claims.some(c=>c.analysisHistory?.length && c.reviewHistory?.length)) throw new Error('Persisted histories missing');
 console.log(JSON.stringify({claims:claims.length,evidence,audits,persistedHistories:true}));
 await mongoose.disconnect();
})().catch(error=>{ console.error(error.message); process.exit(1); });
