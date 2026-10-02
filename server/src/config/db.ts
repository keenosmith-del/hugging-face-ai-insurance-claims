import mongoose from 'mongoose';
export async function connectDatabase(uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/insurance_claims') {
  mongoose.set('bufferCommands', false);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.info('[DB] MongoDB connected');
}
