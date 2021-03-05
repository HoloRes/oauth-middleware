import mongoose, { Schema, Document } from 'mongoose';
import intformat from 'biguint-format';
import FlakeId from 'flake-idgen';

const flakeIdGen = new FlakeId();

const ApplicationSchema: Schema = new mongoose.Schema({
	_id: { type: String, default: intformat(flakeIdGen.next(), 'dec').toString() }, // Client ID
	name: { type: String, required: true },
	redirectUrl: { type: String, required: true },
	clientSecret: { type: String, required: true },
});

export interface Type extends Document {
	_id: string,
	redirectUrl: string,
	clientId: string,
	clientSecret: string,
}

export default mongoose.model<Type>('Application', ApplicationSchema, 'applications');
