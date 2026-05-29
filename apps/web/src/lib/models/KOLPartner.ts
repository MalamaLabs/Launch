import mongoose, { Schema, model, models, Document } from 'mongoose'

export interface IKOLPartner extends Document {
  id:             string    // URL-safe slug — used in ?ref=<id>
  walletAddress:  string
  email?:         string
  displayName:    string
  bio?:           string
  twitterHandle?: string
  commissionBps:  number
  approved:       boolean
  clickCount:     number
  createdAt:      Date
  updatedAt:      Date
}

export interface IKOLCommission extends Document {
  kolId:            string
  claimId:          string
  hexId:            string
  buyerEmail:       string
  chain:            'base' | 'cardano'
  saleAmountUsd:    number
  commissionUsd:    number
  commissionBps:    number
  status:           'pending' | 'paid' | 'cancelled'
  txHash?:          string
  stripeSessionId?: string
  paidAt?:          Date
  createdAt:        Date
  updatedAt:        Date
}

const KOLPartnerSchema = new Schema<IKOLPartner>(
  {
    id:            { type: String, required: true, unique: true },
    walletAddress: { type: String, required: true, unique: true },
    email:         { type: String, sparse: true, index: true },
    displayName:   { type: String, required: true },
    bio:           String,
    twitterHandle: String,
    commissionBps: { type: Number, default: 1000 },
    approved:      { type: Boolean, default: false, index: true },
    clickCount:    { type: Number, default: 0 },
  },
  { timestamps: true },
)

const KOLCommissionSchema = new Schema<IKOLCommission>(
  {
    kolId:           { type: String, required: true, index: true },
    claimId:         { type: String, required: true },
    hexId:           { type: String, required: true },
    buyerEmail:      String,
    chain:           { type: String, enum: ['base', 'cardano'], required: true },
    saleAmountUsd:   Number,
    commissionUsd:   Number,
    commissionBps:   Number,
    status:          { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending', index: true },
    txHash:          String,
    stripeSessionId: String,
    paidAt:          Date,
  },
  { timestamps: true },
)

export const KOLPartnerModel =
  (models.KOLPartner as mongoose.Model<IKOLPartner>) ??
  model<IKOLPartner>('KOLPartner', KOLPartnerSchema)

export const KOLCommissionModel =
  (models.KOLCommission as mongoose.Model<IKOLCommission>) ??
  model<IKOLCommission>('KOLCommission', KOLCommissionSchema)
