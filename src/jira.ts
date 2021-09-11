// Imports
import axios, { AxiosResponse } from 'axios';
import Discord, { GuildMember } from 'discord.js';

// Local files
import generator from 'generate-password';
import { CreatedUser, User } from './types';
// eslint-disable-next-line import/no-cycle
import { client } from './index';
import GroupLink, { Type as GroupLinkType } from './models/GroupLink';
import UserDoc, { Type as UserType, Type as UserDocType } from './models/User';

const config = require('../config.json');

// Variables
const url = `${config.jira.url}/rest/api/latest`;
const emailRegex = /^([0-z]|-)+$/i;

// eslint-disable-next-line max-len
const createUser = async (username: string, email: string, discordId: string): Promise<CreatedUser> => {
	const res = await axios.post(`${url}/user`, {
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
	}).catch((e) => {
		throw e;
	});

	const doc = await UserDoc.findById(discordId).exec().catch((e) => {
		throw e;
	});

	// eslint-disable-next-line no-param-reassign
	doc!.jiraKey = res.data.key;
	await doc!.save();

	return res.data;
};

const findUser = async (username: string, email: string, discordId: string): Promise<User> => {
	const res = await axios.get(`${url}/user`, {
		params: { username, expand: 'groups' },
		auth: {
			username: config.jira.username,
			password: config.jira.apiToken,
		},
	}).catch((err) => {
		if (err.response?.status === 404) {
			createUser(username, email, discordId)
				.then(() => findUser(username, email, discordId).then((user) => user)).catch((e) => {
					throw e;
				});
		} else throw err;
	}) as AxiosResponse;

	return res.data!;
};

export const findUserByKey = async (key: string): Promise<User> => {
	const res = await axios.get(`${url}/user`, {
		params: { key, expand: 'groups' },
		auth: {
			username: config.jira.username,
			password: config.jira.apiToken,
		},
	}).catch((err) => {
		console.log(err.response?.data);
		throw err;
	});

	return res.data;
};

const createEmail = async (member: Discord.GuildMember, user: UserDocType): Promise<string> => {
	async function createEmailRequest(username: string, password: string): Promise<string> {
		await axios.post(`${config.mailcow.url}/api/v1/add/mailbox`, {
			active: 1,
			domain: config.mailcow.tlDomain,
			local_part: username,
			password,
			password2: password,
			quota: 3072,
			force_pw_update: 1,
		}, {
			headers: {
				'X-API-Key': config.mailcow.apiKey,
			},
		}).catch(console.error);

		// eslint-disable-next-line no-param-reassign
		user.mailcowEmail = `${username}@${config.mailcow.tlDomain}`;
		user.save();
		member.user.send(`Email has been automatically created:
Email: \`${username}@${config.mailcow.tlDomain}\`
Password: \`${password}\`
Please immediately change your password here: ${config.mailcow.url}
If you have any issues or want to setup email forwarding, check the internal wiki. If you still can't figure it out, contact support.
		`);
		return user.mailcowEmail;
	}

	const generatedPassword = generator.generate({
		length: 14,
		numbers: true,
		strict: true,
	});

	let username = member.user.username.replace(/\s/g, '-').toLowerCase();
	let valid = emailRegex.test(username);
	if (!valid) {
		const msg = await member.user.send('Your Discord username is not a valid for an email address. Please respond in 1 minute with a proper alphanumerical username.');

		return new Promise((reject, resolve) => {
			// eslint-disable-next-line max-len
			const collector = msg.channel.createMessageCollector({ filter: (message) => message.author.id === member.user.id, time: 60 * 1000 });

			collector.on('collect', async (message) => {
				valid = emailRegex.test(message.content.replace(/\s/g, '-').toLowerCase());
				if (!valid) await member.user.send('Invalid username');
				else {
					username = message.content.replace(/\s/g, '-').toLowerCase();
					resolve(await createEmailRequest(username, generatedPassword));
					collector.stop();
				}
			});

			collector.on('end', (collected) => {
				if (collected.size === 0 || !valid) {
					member.user.send('No valid username recorded, please put in a request for an email in the Discord support channel, or login once again to restart the process. ');
					reject(`Failed to create email for: ${member.user.tag}.`);
				}
			});
		});
	} return createEmailRequest(username, generatedPassword);
};

// eslint-disable-next-line max-len
export const updateUserGroups = async (discordId: string, username: string): Promise<void | UserDocType> => {
	const guild = await client.guilds.fetch(config.discordServerId)
		.catch((err) => {
			throw err;
		});

	const member: GuildMember = await guild?.members.fetch(discordId)
		.catch((err) => {
			throw err;
		});

	const userDoc = await UserDoc.findById(discordId).exec()
		.catch((e) => {
			throw e;
		});
	let email = userDoc?.mailcowEmail ?? undefined;
	if (!email) email = await createEmail(member, <UserDocType>userDoc);

	const user = await findUser(username, email, discordId)
		.catch((err) => {
			throw err;
		});

	// @ts-expect-error Possible void
	const groupLinks: Array<GroupLinkType> = await GroupLink.find({}).lean().exec()
		.catch((err) => {
			throw err;
		});

	UserDoc.findById(discordId, (err: any, doc: UserType) => {
		if (err) return;
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
				throw err;
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
				throw err;
			});
		}
	});

	await Promise.all(addRolesPromise);
};

// eslint-disable-next-line max-len
export const updateUserGroupsByKey = async (discordId: string, key: string): Promise<void> => {
	const user = await findUserByKey(key)
		.catch((e) => {
			throw e;
		});

	const guild = await client.guilds.fetch(config.discordServerId)
		.catch((e) => {
			throw e;
		});

	const member: GuildMember = await guild?.members.fetch(discordId)
		.catch((e) => {
			throw e;
		});

	UserDoc.findById(discordId, (err: any, doc: UserType) => {
		if (err) return;
		// eslint-disable-next-line no-param-reassign
		doc.lastKnownName = user.name;
		doc.save();
		if (doc && !doc.mailcowEmail) createEmail(member, doc);
	});

	// @ts-expect-error groupLinks possible void
	const groupLinks: Array<GroupLinkType> = await GroupLink.find({}).lean().exec()
		.catch((e) => {
			throw e;
		});

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
			}).catch((e) => {
				throw e;
			});
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
				throw err;
			});
		}
	});

	await Promise.all(addRolesPromise);
};
