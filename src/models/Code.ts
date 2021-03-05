import mongoose, { Schema, Document } from 'mongoose';

const CodeSchema: Schema = new mongoose.Schema({
	token: { type: String, required: true },
	redirectUri: { type: String, required: true },
	userId: { type: String, required: true },
	clientId: { type: String, required: true },
});

export interface Type extends Document {
	token: string,
	redirectUri: string,
	userId: string,
	clientId: string
}

export default mongoose.model<Type>('Code', CodeSchema, 'codes');
