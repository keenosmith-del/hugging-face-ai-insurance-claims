import mongoose, { Schema } from 'mongoose';
const evidenceSchema = new Schema({
  claimId: { type: Schema.Types.ObjectId, ref: 'Claim', required: true, index: true }, filename: { type: String, required: true },
  mimeType: { type: String, required: true }, filePath: { type: String, required: true }, size: Number, sha256: String,
  evidenceType: { type: String, enum: ['accident_photo','driver_license','police_report','insurance_policy','vehicle_registration','repair_estimate','repair_invoice','supporting_correspondence','unknown'], default: 'unknown' },
  extractionStatus: { type: String, enum: ['pending','completed','failed'], default: 'pending' }, extractionMetadata: Schema.Types.Mixed, documentClassification: Schema.Types.Mixed, extractedText: { type: String, default: '' }, entities: { type: [Schema.Types.Mixed], default: [] }, aiAnalysis: Schema.Types.Mixed
}, { timestamps: true });
export const Evidence = mongoose.model('Evidence', evidenceSchema);
