// Imports
import axios from 'axios';

// Types
import { CreatedUser, User } from './types';

// Local files
const config = require('../config.json');

// Variables
const url = `${config.jira.url}/rest/api/latest`;

// eslint-disable-next-line no-async-promise-executor
const createUser = (username: string) => new Promise(async (resolve, reject) => {

});

// eslint-disable-next-line no-async-promise-executor
const findUser = (username: string) => new Promise(async (resolve, reject) => {
	const res = await axios.get(`${url}/user`, {
		params: { username },
	})
		.catch((err) => {
			if (err.response?.statusCode === 404) {
				createUser(username).then(resolve).catch(reject);
			} else reject(new Error(err));
		});

	resolve(res?.data);
});

// eslint-disable-next-line no-async-promise-executor
export const updateUserGroups = (username: string) => new Promise(async (resolve, reject) => {
	const user = await findUser(username);
});
