import mongoose, { Schema, model, models, Document } from 'mongoose'

export interface IShipping {
  name: string
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface IUserProfile extends Document {
  /** All wallet addresses associated with this user (EVM + Cardano) */
  walletAddresses: string[]
  /** Email used at checkout / Magic OTP — also used for update notifications */
  notificationEmail: string
  shipping?: IShipping
  createdAt: Date
  updatedAt: Date
}

const ShippingSchema = new Schema<IShipping>(
  {
    name:       { type: String, default: '' },
    line1:      { type: String, default: '' },
    line2:      { type: String, default: '' },
    city:       { type: String, default: '' },
    state:      { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country:    { type: String, default: 'US' },
  },
  { _id: false }
)

const UserProfileSchema = new Schema<IUserProfile>(
  {
    walletAddresses:   { type: [String], default: [], index: true },
    notificationEmail: { type: String, default: '', index: true },
    shipping:          { type: ShippingSchema, default: null },
  },
  { timestamps: true }
)

// Prevent model re-compilation during hot reload in Next.js dev
export const UserProfile =
  (models.UserProfile as mongoose.Model<IUserProfile>) ??
  model<IUserProfile>('UserProfile', UserProfileSchema)
