import mongoose from 'mongoose';

const ApplicationSchema = new mongoose.Schema({
	name: { type: String, required: true },
	callbackUrl: [String],
	clientId: { type: String, required: true },
	clientSecret: { type: String, required: true },
});

export default mongoose.model('Application', ApplicationSchema, 'applications');

export interface Type {
	_id?: string,
	callbackUrl: Array<String>,
	clientId: string,
	clientSecret: String,
}
