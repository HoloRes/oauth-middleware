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
const index_1 = require("./index");
const GroupLink_1 = __importDefault(require("./models/GroupLink"));
const User_1 = __importDefault(require("./models/User"));
const config = require('../config.json');
// Variables
const url = `${config.jira.url}/rest/api/latest`;
// eslint-disable-next-line max-len
const createUser = (username, email, discordId) => new Promise((resolve, reject) => {
    axios_1.default.post(`${url}/user`, {
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
        User_1.default.findById(discordId, (err, doc) => __awaiter(void 0, void 0, void 0, function* () {
            if (err)
                throw new Error(err);
            // eslint-disable-next-line no-param-reassign
            doc.jiraKey = res.data.key;
            yield doc.save();
            resolve(res.data);
        }));
    }).catch(reject);
});
// eslint-disable-next-line max-len
const findUser = (username, email, discordId) => new Promise((resolve, reject) => {
    axios_1.default.get(`${url}/user`, {
        params: { username, expand: 'groups' },
        auth: {
            username: config.jira.username,
            password: config.jira.apiToken,
        },
    }).then((res) => {
        resolve(res.data);
    }).catch((err) => {
        var _a;
        if (((_a = err.response) === null || _a === void 0 ? void 0 : _a.status) === 404) {
            createUser(username, email, discordId)
                .then(() => findUser(username, email, discordId).then(resolve)).catch(reject);
        }
        else
            reject(new Error(err));
    });
});
const findUserByKey = (key) => new Promise((resolve, reject) => {
    axios_1.default.get(`${url}/user`, {
        params: { key, expand: 'groups' },
        auth: {
            username: config.jira.username,
            password: config.jira.apiToken,
        },
    }).then((res) => {
        resolve(res.data);
    }).catch((err) => {
        var _a;
        console.log((_a = err.response) === null || _a === void 0 ? void 0 : _a.data);
        reject(new Error(err));
    });
});
exports.findUserByKey = findUserByKey;
// eslint-disable-next-line max-len
const updateUserGroups = (discordId, username, email) => new Promise((resolve, reject) => {
    findUser(username, email, discordId).then((user) => __awaiter(void 0, void 0, void 0, function* () {
        const guild = yield index_1.client.guilds.fetch(config.discordServerId).catch(reject);
        // @ts-expect-error guild.members possibly undefined
        const member = yield (guild === null || guild === void 0 ? void 0 : guild.members.fetch(discordId).catch(reject));
        // @ts-expect-error Possible void
        const groupLinks = yield GroupLink_1.default.find({}).lean().exec()
            .catch(reject);
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
                    reject(err);
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
                    reject(err);
                });
            }
        });
        yield Promise.all(addRolesPromise);
        resolve();
    })).catch(reject);
});
exports.updateUserGroups = updateUserGroups;
// eslint-disable-next-line max-len
const updateUserGroupsByKey = (discordId, key) => new Promise((resolve, reject) => {
    exports.findUserByKey(key).then((user) => __awaiter(void 0, void 0, void 0, function* () {
        const guild = yield index_1.client.guilds.fetch(config.discordServerId).catch(reject);
        // @ts-expect-error guild.members possibly undefined
        const member = yield (guild === null || guild === void 0 ? void 0 : guild.members.fetch(discordId).catch(reject));
        // @ts-expect-error groupLinks possible void
        const groupLinks = yield GroupLink_1.default.find({}).lean().exec()
            .catch(reject);
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
                }).catch(reject);
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
                    reject(err);
                });
            }
        });
        yield Promise.all(addRolesPromise);
        resolve();
    })).catch(reject);
});
exports.updateUserGroupsByKey = updateUserGroupsByKey;