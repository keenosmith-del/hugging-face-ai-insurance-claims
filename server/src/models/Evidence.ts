import mongoose, { Schema } from 'mongoose';
const evidenceSchema = new Schema({
  claimId: { type: Schema.Types.ObjectId, ref: 'Claim', required: true, index: true }, filename: { type: String, required: true },
  mimeType: { type: String, required: true }, filePath: { type: String, required: true }, size: Number,
  evidenceType: { type: String, enum: ['accident_photo','driver_license','police_report','insurance_policy','vehicle_registration','repair_estimate','repair_invoice','unknown'], default: 'unknown' },
  documentClassification: Schema.Types.Mixed, extractedText: { type: String, default: '' }, entities: { type: [Schema.Types.Mixed], default: [] }, aiAnalysis: Schema.Types.Mixed
}, { timestamps: true });
export const Evidence = mongoose.model('Evidence', evidenceSchema);
