import mongoose, { Schema } from 'mongoose';
export const Audit = mongoose.model('Audit', new Schema({ actor: String, action: String, resource: String, statusCode: Number, at: { type: Date, default: Date.now } }));
