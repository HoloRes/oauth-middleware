import mongoose, { Schema, Document } from 'mongoose';

const AccessTokenSchema: Schema = new mongoose.Schema({
	token: { type: String, required: true },
	userId: { type: String, required: true },
	clientId: { type: String, required: true },
});

export interface Type extends Document {
	token: string,
	userId: string,
	clientId: string
}

export default mongoose.model<Type>('AccessToken', AccessTokenSchema, 'accesstokens');
