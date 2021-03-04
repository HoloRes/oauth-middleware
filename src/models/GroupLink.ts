import mongoose from 'mongoose';

const GroupLinkSchema = new mongoose.Schema({
	_id: { type: String, required: true },
	jiraId: { type: String },
});

export default mongoose.model('GroupLink', GroupLinkSchema, 'groups');

export interface Type {
	_id: string,
	jiraId?: string
}
