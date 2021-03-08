import mongoose, { Schema, Document } from 'mongoose';

const UserSchema: Schema = new mongoose.Schema({
	_id: { type: String, required: true },
	jiraKey: { type: String },
	email: { type: String, required: true },
});

export interface Type extends Document {
	_doc: object;
	_id: string,
	jiraKey?: string,
	email: string
}

export default mongoose.model<Type>('User', UserSchema, 'users');
