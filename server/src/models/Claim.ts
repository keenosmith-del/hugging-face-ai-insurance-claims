import mongoose, { Schema } from 'mongoose';
const claimSchema = new Schema({
  claimNumber: { type: String, unique: true, index: true }, title: { type: String, required: true, trim: true },
  description: { type: String, default: '' }, status: { type: String, enum: ['Draft','Processing','Awaiting Review','Awaiting Information','Resolved'], default: 'Draft' },
  estimatedDamage: { type: Number, default: null }, coverageAssessment: { type: String, default: 'Not assessed' },
  missingInformation: { type: [String], default: [] }, riskIndicators: { type: [String], default: [] },
  detectedDamage: { type: [Schema.Types.Mixed], default: [] }, recommendations: { type: [String], default: [] },
  analysis: { type: Schema.Types.Mixed, default: null }, analysedAt: Date,
  humanReview: {
    outcome: { type: String, enum: ['approved','declined','more_information_required'] },
    notes: { type: String, trim: true, maxlength: 2000 },
    reviewedAt: Date
  }
}, { timestamps: true });
claimSchema.pre('validate', function () { if (!this.claimNumber) this.claimNumber = `CLM-${new Date().getUTCFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`; });
export const Claim = mongoose.model('Claim', claimSchema);
