// Imports
import axios from 'axios';
import Discord from 'discord.js';

// Local files
import generator from 'generate-password';
import { CreatedUser, User } from './types';
import { client } from './index';
import GroupLink, { Type as GroupLinkType } from './models/GroupLink';
import UserDoc, { Type as UserType, Type as UserDocType } from './models/User';

const config = require('../config.json');

// Variables
const url = `${config.jira.url}/rest/api/latest`;

// eslint-disable-next-line max-len
const createUser = (username: string, email: string, discordId: string): Promise<CreatedUser> => new Promise((resolve, reject) => {
	axios.post(`${url}/user`, {
		name: username,
		emailAddress: email,
		displayName: username,
		applicationKeys: [
			'jira-software',
		],
	}, {
		auth: {
			username: config.jira.username,
			password: config.jira.apiToken,
		},
	}).then((res) => {
		UserDoc.findById(discordId, async (err: any, doc: UserDocType) => {
			if (err) throw new Error(err);
			// eslint-disable-next-line no-param-reassign
			doc.jiraKey = res.data.key;
			await doc.save();
			resolve(res.data);
		});
	}).catch(reject);
});

// eslint-disable-next-line max-len
const findUser = (username: string, email: string, discordId: string): Promise<User> => new Promise((resolve, reject) => {
	axios.get(`${url}/user`, {
		params: { username, expand: 'groups' },
		auth: {
			username: config.jira.username,
			password: config.jira.apiToken,
		},
	}).then((res) => {
		resolve(res.data);
	}).catch((err) => {
		if (err.response?.status === 404) {
			createUser(username, email, discordId)
				.then(() => findUser(username, email, discordId).then(resolve)).catch(reject);
		} else reject(new Error(err));
	});
});

export const findUserByKey = (key: string): Promise<User> => new Promise((resolve, reject) => {
	axios.get(`${url}/user`, {
		params: { key, expand: 'groups' },
		auth: {
			username: config.jira.username,
			password: config.jira.apiToken,
		},
	}).then((res) => {
		resolve(res.data);
	}).catch((err) => {
		console.log(err.response?.data);
		reject(new Error(err));
	});
});

function createEmail(member: Discord.GuildMember, user: UserDocType): void {
	const generatedPassword = generator.generate({
		length: 14,
		numbers: true,
		strict: true,
	});

	const username = member.user.username.replace(/\s/g, '-').toLowerCase();

	axios.post(`${config.mailcow.url}/api/v1/add/mailbox`, {
		active: 1,
		domain: config.mailcow.tlDomain,
		local_part: username,
		password: generatedPassword,
		password2: generatedPassword,
		quota: 3072,
		force_pw_update: 1,
	}, {
		headers: {
			'X-API-Key': config.mailcow.apiKey,
		},
	}).then(() => {
		// eslint-disable-next-line no-param-reassign
		user.mailcowEmail = `${username}@${config.mailcow.tlDomain}`;
		user.save();
		member.user.send(`Email has been automatically created:
Email: \`${member.user.username}@${config.mailcow.tlDomain}\`
Password: \`${generatedPassword}\`
Please immediately change your password here: ${config.mailcow.url}
If you have any issues, file an ticket here: https://holores.atlassian.net/servicedesk/customer/portal/3
Mail redirect can be done via the webmail client, Preferences > Mail > Forward
		`);
	}).catch(console.error);
}

// eslint-disable-next-line max-len
export const updateUserGroups = (discordId: string, username: string, email: string): Promise<void|UserDocType> => new Promise((resolve, reject) => {
	findUser(username, email, discordId).then(async (user) => {
		const guild = await client.guilds.fetch(config.discordServerId).catch(reject);
		// @ts-expect-error guild.members possibly undefined
		const member = await guild?.members.fetch(discordId).catch(reject);

		// @ts-expect-error Possible void
		const groupLinks: Array<GroupLinkType> = await GroupLink.find({}).lean().exec()
			.catch(reject);

		UserDoc.findById(discordId, (err: any, doc: UserType) => {
			if (err) return;
			if (doc && !doc.mailcowEmail) createEmail(member, doc);
			if (doc && !doc.jiraKey) {
				// eslint-disable-next-line no-param-reassign
				doc.jiraKey = user.key;
				doc.save();
			}
		});

		user.groups.items.forEach((group) => {
			const link = groupLinks.find((item) => item.jiraName === group.name);
			if (link && !member.roles.cache.has(link._id)) {
				axios.delete(`${url}/group/user`, {
					params: {
						groupname: link.jiraName,
						username,
					},
					auth: {
						username: config.jira.username,
						password: config.jira.apiToken,
					},
				}).catch((err) => {
					console.log(err.response.data);
					reject(err);
				});
			}
		});
		const addRolesPromise = member.roles.cache.each((role: Discord.Role) => {
			const link = groupLinks.find((item) => item._id === role.id);
			if (link) {
				axios.post(`${url}/group/user`, {
					name: username,
				}, {
					params: {
						groupname: link.jiraName,
					},
					auth: {
						username: config.jira.username,
						password: config.jira.apiToken,
					},
				}).catch((err) => {
					if (/user is already a member/gi.test(err.response?.data.errorMessages[0])) return;

					console.log(err.response.data);
					reject(err);
				});
			}
		});

		await Promise.all(addRolesPromise);
		resolve();
	}).catch(reject);
});

// eslint-disable-next-line max-len
export const updateUserGroupsByKey = (discordId: string, key: string): Promise<void> => new Promise((resolve, reject) => {
	findUserByKey(key).then(async (user) => {
		const guild = await client.guilds.fetch(config.discordServerId).catch(reject);
		// @ts-expect-error guild.members possibly undefined
		const member = await guild?.members.fetch(discordId).catch(reject);
		UserDoc.findById(discordId, (err: any, doc: UserType) => {
			if (err) return;
			if (doc && !doc.mailcowEmail) createEmail(member, doc);
		});

		// @ts-expect-error groupLinks possible void
		const groupLinks: Array<GroupLinkType> = await GroupLink.find({}).lean().exec()
			.catch(reject);

		user.groups.items.forEach((group) => {
			const link = groupLinks.find((item) => item.jiraName === group.name);
			if (link && !member.roles.cache.has(link._id)) {
				axios.delete(`${url}/group/user`, {
					params: {
						groupname: link.jiraName,
						username: user.name,
					},
					auth: {
						username: config.jira.username,
						password: config.jira.apiToken,
					},
				}).catch(reject);
			}
		});
		const addRolesPromise = member.roles.cache.each((role: Discord.Role) => {
			const link = groupLinks.find((item) => item._id === role.id);
			if (link) {
				axios.post(`${url}/group/user`, {
					name: user.name,
				}, {
					params: {
						groupname: link.jiraName,
					},
					auth: {
						username: config.jira.username,
						password: config.jira.apiToken,
					},
				}).catch((err) => {
					if (/user is already a member/gi.test(err.response?.data.errorMessages[0])) return;

					console.log(err.response.data);
					reject(err);
				});
			}
		});

		await Promise.all(addRolesPromise);
		resolve();
	}).catch(reject);
});
