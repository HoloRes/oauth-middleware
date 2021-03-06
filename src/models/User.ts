import mongoose, { Schema, Document } from 'mongoose';

const UserSchema: Schema = new mongoose.Schema({
	_id: { type: String, required: true },
	jiraKey: { type: String },
	username: { type: String, required: true },
	email: { type: String, required: true },
});

export interface Type extends Document {
	_doc: object;
	_id: string,
	jiraKey?: string,
	username: string,
	email: string
}

export default mongoose.model<Type>('User', UserSchema, 'users');
