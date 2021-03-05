import mongoose, { Schema, Document } from 'mongoose';

const GroupLinkSchema: Schema = new mongoose.Schema({
	_id: { type: String, required: true },
	jiraName: { type: String, required: true },
	baseRole: { type: Boolean, default: false },
});

export interface Type extends Document {
	_id: string,
	jiraName?: string,
	baseRole: boolean
}

export default mongoose.model<Type>('GroupLink', GroupLinkSchema, 'groups');
