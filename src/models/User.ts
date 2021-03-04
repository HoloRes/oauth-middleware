import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	jiraId: { type: String },
});

export default mongoose.model('User', UserSchema, 'users');

export interface Type {
	_id: string,
	jiraId?: string
}
