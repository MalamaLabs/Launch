import mongoose, { Schema, model, models, Document } from 'mongoose'

export interface IUserAccount extends Document {
  userId:           string    // sha256(email) or sha256(evmAddress) — stable lookup key
  email?:           string
  evmAddresses:     string[]
  cardanoAddresses: string[]
  hexIds:           string[]
  createdAt:        Date
  updatedAt:        Date
}

const UserAccountSchema = new Schema<IUserAccount>(
  {
    userId:           { type: String, required: true, unique: true },
    email:            { type: String, sparse: true, index: true },
    evmAddresses:     { type: [String], default: [] },
    cardanoAddresses: { type: [String], default: [] },
    hexIds:           { type: [String], default: [] },
  },
  { timestamps: true },
)

UserAccountSchema.index({ evmAddresses: 1 })
UserAccountSchema.index({ cardanoAddresses: 1 })

export const UserAccountModel =
  (models.UserAccount as mongoose.Model<IUserAccount>) ??
  model<IUserAccount>('UserAccount', UserAccountSchema)
