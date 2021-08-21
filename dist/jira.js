"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserGroupsByKey = exports.updateUserGroups = exports.findUserByKey = void 0;
// Imports
const axios_1 = __importDefault(require("axios"));
// Local files
const generate_password_1 = __importDefault(require("generate-password"));
// eslint-disable-next-line import/no-cycle
const index_1 = require("./index");
const GroupLink_1 = __importDefault(require("./models/GroupLink"));
const User_1 = __importDefault(require("./models/User"));
const config = require('../config.json');
// Variables
const url = `${config.jira.url}/rest/api/latest`;
const emailRegex = /^([0-z]|-)+$/i;
// eslint-disable-next-line max-len
const createUser = (username, email, discordId) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield axios_1.default.post(`${url}/user`, {
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
    const doc = yield User_1.default.findById(discordId).exec().catch((e) => {
        throw e;
    });
    // eslint-disable-next-line no-param-reassign
    doc.jiraKey = res.data.key;
    yield doc.save();
    return res.data;
});
const findUser = (username, email, discordId) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield axios_1.default.get(`${url}/user`, {
        params: { username, expand: 'groups' },
        auth: {
            username: config.jira.username,
            password: config.jira.apiToken,
        },
    }).catch((err) => {
        var _a;
        if (((_a = err.response) === null || _a === void 0 ? void 0 : _a.status) === 404) {
            createUser(username, email, discordId)
                .then(() => findUser(username, email, discordId).then((user) => user)).catch((e) => {
                throw e;
            });
        }
        else
            throw err;
    });
    return res.data;
});
const findUserByKey = (key) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield axios_1.default.get(`${url}/user`, {
        params: { key, expand: 'groups' },
        auth: {
            username: config.jira.username,
            password: config.jira.apiToken,
        },
    }).catch((err) => {
        var _a;
        console.log((_a = err.response) === null || _a === void 0 ? void 0 : _a.data);
        throw err;
    });
    return res.data;
});
exports.findUserByKey = findUserByKey;
const createEmail = (member, user) => __awaiter(void 0, void 0, void 0, function* () {
    function createEmailRequest(username, password) {
        return __awaiter(this, void 0, void 0, function* () {
            yield axios_1.default.post(`${config.mailcow.url}/api/v1/add/mailbox`, {
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
        });
    }
    const generatedPassword = generate_password_1.default.generate({
        length: 14,
        numbers: true,
        strict: true,
    });
    let username = member.user.username.replace(/\s/g, '-').toLowerCase();
    let valid = emailRegex.test(username);
    if (!valid) {
        const msg = yield member.user.send('Your Discord username is not a valid for an email address. Please respond in 1 minute with a proper alphanumerical username.');
        return new Promise((reject, resolve) => {
            // eslint-disable-next-line max-len
            const collector = msg.channel.createMessageCollector({ filter: (message) => message.author.id === member.user.id, time: 60 * 1000 });
            collector.on('collect', (message) => __awaiter(void 0, void 0, void 0, function* () {
                valid = emailRegex.test(message.content.replace(/\s/g, '-').toLowerCase());
                if (!valid)
                    yield member.user.send('Invalid username');
                else {
                    username = message.content.replace(/\s/g, '-').toLowerCase();
                    resolve(yield createEmailRequest(username, generatedPassword));
                    collector.stop();
                }
            }));
            collector.on('end', (collected) => {
                if (collected.size === 0 || !valid) {
                    member.user.send('No valid username recorded, please put in a request for an email in the Discord support channel, or login once again to restart the process. ');
                    reject(`Failed to create email for: ${member.user.tag}.`);
                }
            });
        });
    }
    return createEmailRequest(username, generatedPassword);
});
// eslint-disable-next-line max-len
const updateUserGroups = (discordId, username) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const guild = yield index_1.client.guilds.fetch(config.discordServerId)
        .catch((err) => {
        throw err;
    });
    const member = yield (guild === null || guild === void 0 ? void 0 : guild.members.fetch(discordId).catch((err) => {
        throw err;
    }));
    const userDoc = yield User_1.default.findById(discordId).exec()
        .catch((e) => {
        throw e;
    });
    let email = (_a = userDoc === null || userDoc === void 0 ? void 0 : userDoc.mailcowEmail) !== null && _a !== void 0 ? _a : undefined;
    if (!email)
        email = yield createEmail(member, userDoc);
    const user = yield findUser(username, email, discordId)
        .catch((err) => {
        throw err;
    });
    // @ts-expect-error Possible void
    const groupLinks = yield GroupLink_1.default.find({}).lean().exec()
        .catch((err) => {
        throw err;
    });
    User_1.default.findById(discordId, (err, doc) => {
        if (err)
            return;
        if (doc && !doc.jiraKey) {
            // eslint-disable-next-line no-param-reassign
            doc.jiraKey = user.key;
            doc.save();
        }
    });
    user.groups.items.forEach((group) => {
        const link = groupLinks.find((item) => item.jiraName === group.name);
        if (link && !member.roles.cache.has(link._id)) {
            axios_1.default.delete(`${url}/group/user`, {
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
    const addRolesPromise = member.roles.cache.each((role) => {
        const link = groupLinks.find((item) => item._id === role.id);
        if (link) {
            axios_1.default.post(`${url}/group/user`, {
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
                var _a;
                if (/user is already a member/gi.test((_a = err.response) === null || _a === void 0 ? void 0 : _a.data.errorMessages[0]))
                    return;
                console.log(err.response.data);
                throw err;
            });
        }
    });
    yield Promise.all(addRolesPromise);
});
exports.updateUserGroups = updateUserGroups;
// eslint-disable-next-line max-len
const updateUserGroupsByKey = (discordId, key) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield exports.findUserByKey(key)
        .catch((e) => {
        throw e;
    });
    const guild = yield index_1.client.guilds.fetch(config.discordServerId)
        .catch((e) => {
        throw e;
    });
    const member = yield (guild === null || guild === void 0 ? void 0 : guild.members.fetch(discordId).catch((e) => {
        throw e;
    }));
    User_1.default.findById(discordId, (err, doc) => {
        if (err)
            return;
        if (doc && !doc.mailcowEmail)
            createEmail(member, doc);
    });
    // @ts-expect-error groupLinks possible void
    const groupLinks = yield GroupLink_1.default.find({}).lean().exec()
        .catch((e) => {
        throw e;
    });
    user.groups.items.forEach((group) => {
        const link = groupLinks.find((item) => item.jiraName === group.name);
        if (link && !member.roles.cache.has(link._id)) {
            axios_1.default.delete(`${url}/group/user`, {
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
    const addRolesPromise = member.roles.cache.each((role) => {
        const link = groupLinks.find((item) => item._id === role.id);
        if (link) {
            axios_1.default.post(`${url}/group/user`, {
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
                var _a;
                if (/user is already a member/gi.test((_a = err.response) === null || _a === void 0 ? void 0 : _a.data.errorMessages[0]))
                    return;
                console.log(err.response.data);
                throw err;
            });
        }
    });
    yield Promise.all(addRolesPromise);
});
exports.updateUserGroupsByKey = updateUserGroupsByKey;
