/* eslint-disable max-classes-per-file */

import { Db, MongoClient } from 'mongodb';
import snakeCase from 'lodash/snakeCase';

const config = require('../../config.json');

const connection = new MongoClient(`mongodb+srv://${config.mongodb.username}:${config.mongodb.password}@${config.mongodb.host}`);
let DB: Db;

const grantable = new Set([
	'access_token',
	'authorization_code',
	'refresh_token',
	'device_code',
	'backchannel_authentication_request',
]);

class CollectionSet extends Set {
	add(name: string): any {
		const nu = this.has(name);
		super.add(name);
		if (!nu) {
			DB.collection(name).createIndexes([
				...(grantable.has(name)
					? [{
						key: { 'payload.grantId': 1 },
					}] : []),
				...(name === 'device_code'
					? [{
						key: { 'payload.userCode': 1 },
						unique: true,
					}] : []),
				...(name === 'session'
					? [{
						key: { 'payload.uid': 1 },
						unique: true,
					}] : []),
				{
					key: { expiresAt: 1 },
					expireAfterSeconds: 0,
				},
			]).catch(console.error); // eslint-disable-line no-console
		}
	}
}

const collections = new CollectionSet();

/* eslint-disable class-methods-use-this */
class MongoAdapter {
	name: string;

	constructor(name: string) {
		this.name = snakeCase(name);

		// NOTE: you should never be creating indexes at runtime in production, the following is in
		//   place just for demonstration purposes of the indexes required
		collections.add(this.name);
	}

	// NOTE: the payload for Session model may contain client_id as keys, make sure you do not use
	//   dots (".") in your client_id value charset.
	async upsert(_id: string, payload: object, expiresIn: number) {
		let expiresAt;

		if (expiresIn) {
			expiresAt = new Date(Date.now() + (expiresIn * 1000));
		}

		await DB.collection('oidc').updateOne(
			{ _id },
			{ $set: { payload, ...(expiresAt ? { expiresAt } : undefined) } },
			{ upsert: true },
		);
	}

	async find(_id: string) {
		const result = await DB.collection('oidc').find(
			{ _id },
		).limit(1).next();

		if (!result) return undefined;
		return result.payload ?? result;
	}

	async findByUserCode(userCode: string) {
		const result = await DB.collection('oidc').find(
			{ 'payload.userCode': userCode },
		).limit(1).next();

		if (!result) return undefined;
		return result.payload;
	}

	async findByUid(uid: string) {
		const result = await DB.collection('oidc').find(
			{ 'payload.uid': uid },
		).limit(1).next();

		if (!result) return undefined;
		return result.payload;
	}

	async destroy(_id: string) {
		await DB.collection('oidc').deleteOne({ _id });
	}

	async revokeByGrantId(grantId: string) {
		await DB.collection('oidc').deleteMany({ 'payload.grantId': grantId });
	}

	async consume(_id: string) {
		await DB.collection('oidc').findOneAndUpdate(
			{ _id },
			{ $set: { 'payload.consumed': Math.floor(Date.now() / 1000) } },
		);
	}

	// This is not part of the required or supported API, all initialization should happen before
	// you pass the adapter to `new Provider`
	static async connect() {
		await connection.connect();
		DB = connection.db(config.mongodb.database);
	}
}

export default MongoAdapter;
