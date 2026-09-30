import mongoose from 'mongoose';
export async function connectDatabase(uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/insurance_claims') {
  await mongoose.connect(uri);
  console.info('[DB] MongoDB connected');
}
